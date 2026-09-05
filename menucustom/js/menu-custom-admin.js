/**
 * Écran de réglages admin de Menu Custom : permet de réordonner les entrées
 * du menu, de les masquer globalement, de choisir où le masquage s'applique
 * (tiroir mobile, menu natif de Nextcloud, ou les deux), et de définir des
 * « vues ».
 *
 * Une vue est un jeu d'entrées masquées associé à un ou plusieurs groupes :
 * « Personnel cantine » et « Personnel scolaire » partagent la même vue plutôt
 * que d'être configurés deux fois à l'identique. Les groupes sont ajoutés via
 * un champ de recherche autocomplété qui interroge le serveur, une instance
 * pouvant compter des milliers de groupes.
 *
 * Vanilla JS, sans dépendance de build, à l'image de menu-custom.js.
 */
(function () {
	'use strict';

	var APP_ID = 'menucustom';
	var SAVE_DEBOUNCE = 600;
	var SEARCH_DEBOUNCE = 250;
	var SEARCH_LIMIT = 25;
	var DEFAULT_SCOPE = 'all';
	var ICON_UPLOAD_PREFIX = 'upload:';
	/** Doit rester aligné sur `IconService::MAX_SIZE`. */
	var MAX_ICON_SIZE = 262144;

	var entries = [];
	var config = { order: [], hidden: [], views: [], scope: DEFAULT_SCOPE, links: [] };

	/** Libellés des groupes connus (id -> nom), alimenté par l'état initial et les recherches. */
	var groupNames = Object.create(null);
	/** Résultats de recherche déjà obtenus, par requête. */
	var searchCache = Object.create(null);

	var root = null;
	var orderList = null;
	var scopeList = null;
	var viewsContainer = null;
	var linksContainer = null;
	var statusEl = null;

	var saveTimer = null;
	var draggedItem = null;
	var viewSequence = 0;
	var linkSequence = 0;

	function qsa(selector, context) {
		return Array.prototype.slice.call((context || document).querySelectorAll(selector));
	}

	function loadState(key, fallback) {
		if (typeof window.OCP !== 'undefined' && window.OCP.InitialState && typeof window.OCP.InitialState.loadState === 'function') {
			try {
				return window.OCP.InitialState.loadState(APP_ID, key, fallback);
			} catch (e) {
				return fallback;
			}
		}
		return fallback;
	}

	function t(text) {
		if (typeof window.t === 'function') {
			try {
				return window.t(APP_ID, text);
			} catch (e) {
				return text;
			}
		}
		return text;
	}

	/** Remplace `{x}` par la valeur correspondante, comme le fait `t()` de Nextcloud. */
	function tp(text, values) {
		var translated = t(text);
		Object.keys(values).forEach(function (key) {
			translated = translated.replace('{' + key + '}', values[key]);
		});
		return translated;
	}

	function url(path) {
		return (typeof window.OC !== 'undefined' && typeof window.OC.generateUrl === 'function')
			? window.OC.generateUrl(path)
			: path;
	}

	function requestHeaders() {
		var headers = { Accept: 'application/json' };
		if (typeof window.OC !== 'undefined' && window.OC.requestToken) {
			headers.requesttoken = window.OC.requestToken;
		}
		return headers;
	}

	function entryName(id) {
		for (var i = 0; i < entries.length; i++) {
			if (entries[i].id === id) {
				return entries[i].name;
			}
		}
		return id;
	}

	function groupName(id) {
		return groupNames[id] || id;
	}

	/* ------------------------------------------------------------------ *
	 * Portée
	 * ------------------------------------------------------------------ */

	function buildScopeList() {
		if (!scopeList) {
			return;
		}

		qsa('input[type="radio"]', scopeList).forEach(function (radio) {
			radio.checked = radio.value === config.scope;
			radio.addEventListener('change', function () {
				if (!radio.checked || config.scope === radio.value) {
					return;
				}
				config.scope = radio.value;
				scheduleSave();
			});
		});
	}

	/* ------------------------------------------------------------------ *
	 * Ordre et visibilité globale
	 * ------------------------------------------------------------------ */

	/**
	 * Trie les entrées selon l'ordre enregistré ; celles qui n'y figurent pas
	 * gardent leur ordre natif et sont placées à la fin.
	 */
	function sortByOrder(list, order) {
		var orderIndex = {};
		order.forEach(function (id, index) {
			orderIndex[id] = index;
		});

		return list
			.map(function (entry, naturalIndex) {
				var hasOrder = Object.prototype.hasOwnProperty.call(orderIndex, entry.id);
				return {
					entry: entry,
					sortKey: hasOrder ? orderIndex[entry.id] : (order.length + naturalIndex),
					naturalIndex: naturalIndex
				};
			})
			.sort(function (a, b) {
				if (a.sortKey !== b.sortKey) {
					return a.sortKey - b.sortKey;
				}
				return a.naturalIndex - b.naturalIndex;
			})
			.map(function (wrapped) {
				return wrapped.entry;
			});
	}

	function buildOrderList() {
		orderList.innerHTML = '';

		if (!entries.length) {
			var hint = document.createElement('li');
			hint.className = 'menucustom-admin-hint';
			hint.textContent = t('Aucune entrée de menu détectée.');
			orderList.appendChild(hint);
			return;
		}

		sortByOrder(entries, config.order).forEach(function (entry) {
			var li = document.createElement('li');
			li.className = 'menucustom-admin-order-item';
			li.draggable = true;
			li.dataset.id = entry.id;

			var handle = document.createElement('span');
			handle.className = 'menucustom-admin-drag-handle';
			handle.setAttribute('aria-hidden', 'true');
			handle.textContent = '⠿';

			var label = document.createElement('label');
			label.className = 'menucustom-admin-order-label';

			var checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = config.hidden.indexOf(entry.id) === -1;
			checkbox.addEventListener('change', function () {
				setHidden(entry.id, !checkbox.checked);
			});

			var text = document.createElement('span');
			text.textContent = entry.name;

			label.appendChild(checkbox);
			label.appendChild(text);

			// Entrée encore référencée par la configuration mais absente de la
			// navigation actuelle (app désactivée ou limitée à d'autres groupes) :
			// le réglage est conservé plutôt que perdu silencieusement.
			if (entry.known === false) {
				label.appendChild(unknownBadge());
			} else if (entry.type === 'link') {
				label.appendChild(linkBadge());
			}

			var controls = document.createElement('span');
			controls.className = 'menucustom-admin-order-controls';

			var up = document.createElement('button');
			up.type = 'button';
			up.className = 'menucustom-admin-order-move';
			up.setAttribute('aria-label', t('Monter'));
			up.textContent = '↑';
			up.addEventListener('click', function () {
				moveItem(li, -1);
			});

			var down = document.createElement('button');
			down.type = 'button';
			down.className = 'menucustom-admin-order-move';
			down.setAttribute('aria-label', t('Descendre'));
			down.textContent = '↓';
			down.addEventListener('click', function () {
				moveItem(li, 1);
			});

			controls.appendChild(up);
			controls.appendChild(down);

			li.appendChild(handle);
			li.appendChild(label);
			li.appendChild(controls);

			li.addEventListener('dragstart', onDragStart);
			li.addEventListener('dragover', onDragOver);
			li.addEventListener('drop', onDrop);
			li.addEventListener('dragend', onDragEnd);

			orderList.appendChild(li);
		});
	}

	function linkBadge() {
		var badge = document.createElement('span');
		badge.className = 'menucustom-admin-badge';
		badge.textContent = t('lien');
		badge.title = t('Lien personnalisé, défini dans le bloc « Liens personnalisés » ci-dessus.');
		return badge;
	}

	function unknownBadge() {
		var badge = document.createElement('span');
		badge.className = 'menucustom-admin-badge';
		badge.textContent = t('app absente');
		badge.title = t('Cette entrée n’apparaît plus dans votre menu : l’app est peut-être désactivée ou réservée à d’autres groupes. Le réglage est conservé.');
		return badge;
	}

	function moveItem(li, direction) {
		var sibling = direction < 0 ? li.previousElementSibling : li.nextElementSibling;
		if (!sibling) {
			return;
		}

		if (direction < 0) {
			orderList.insertBefore(li, sibling);
		} else {
			orderList.insertBefore(sibling, li);
		}

		persistOrderFromDom();
		scheduleSave();
	}

	function onDragStart(event) {
		draggedItem = event.currentTarget;
		draggedItem.classList.add('menucustom-admin-dragging');
		event.dataTransfer.effectAllowed = 'move';
		try {
			event.dataTransfer.setData('text/plain', draggedItem.dataset.id);
		} catch (e) {
			// Certains navigateurs exigent un appel à setData pour autoriser le drag.
		}
	}

	function onDragOver(event) {
		if (!draggedItem || draggedItem === event.currentTarget) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';

		var target = event.currentTarget;
		var rect = target.getBoundingClientRect();
		var before = (event.clientY - rect.top) < (rect.height / 2);

		orderList.insertBefore(draggedItem, before ? target : target.nextSibling);
	}

	function onDrop(event) {
		event.preventDefault();
	}

	function onDragEnd() {
		if (draggedItem) {
			draggedItem.classList.remove('menucustom-admin-dragging');
		}
		draggedItem = null;
		persistOrderFromDom();
		scheduleSave();
	}

	function persistOrderFromDom() {
		config.order = qsa('li', orderList).map(function (li) {
			return li.dataset.id;
		});
	}

	function setHidden(id, hidden) {
		var index = config.hidden.indexOf(id);
		if (hidden && index === -1) {
			config.hidden.push(id);
		} else if (!hidden && index !== -1) {
			config.hidden.splice(index, 1);
		} else {
			return;
		}
		scheduleSave();
	}

	/* ------------------------------------------------------------------ *
	 * Vues
	 * ------------------------------------------------------------------ */

	function buildViews() {
		viewsContainer.innerHTML = '';

		if (!config.views.length) {
			var empty = document.createElement('p');
			empty.className = 'menucustom-admin-hint';
			empty.textContent = t('Aucune vue pour le moment : tous les utilisateurs voient les mêmes raccourcis.');
			viewsContainer.appendChild(empty);
			return;
		}

		config.views.forEach(function (view) {
			viewsContainer.appendChild(buildView(view, false));
		});
	}

	function addView() {
		viewSequence++;
		var view = {
			id: 'view-' + Date.now().toString(36) + '-' + viewSequence,
			name: '',
			groups: [],
			hidden: []
		};
		config.views.push(view);

		var hint = viewsContainer.querySelector('.menucustom-admin-hint');
		if (hint) {
			hint.remove();
		}

		var card = buildView(view, true);
		viewsContainer.appendChild(card);
		card.querySelector('[data-role="view-name"]').focus();
		scheduleSave();
	}

	function removeView(view, card) {
		var index = config.views.indexOf(view);
		if (index !== -1) {
			config.views.splice(index, 1);
		}
		card.remove();

		if (!config.views.length) {
			buildViews();
		}
		scheduleSave();
	}

	function viewTitle(view) {
		return view.name || t('Vue sans nom');
	}

	function viewMeta(view) {
		var groups = view.groups.length === 1
			? t('1 groupe')
			: tp('{count} groupes', { count: view.groups.length });
		var hidden = view.hidden.length === 1
			? t('1 entrée masquée')
			: tp('{count} entrées masquées', { count: view.hidden.length });

		return groups + ' · ' + hidden;
	}

	function buildView(view, open) {
		var card = document.createElement('details');
		card.className = 'menucustom-admin-view';
		card.dataset.viewId = view.id;
		card.open = !!open;

		var summary = document.createElement('summary');

		var title = document.createElement('span');
		title.className = 'menucustom-admin-view-title';
		title.textContent = viewTitle(view);

		var meta = document.createElement('span');
		meta.className = 'menucustom-admin-view-meta';
		meta.textContent = viewMeta(view);

		summary.appendChild(title);
		summary.appendChild(meta);
		card.appendChild(summary);

		var refreshSummary = function () {
			title.textContent = viewTitle(view);
			meta.textContent = viewMeta(view);
		};

		var body = document.createElement('div');
		body.className = 'menucustom-admin-view-body';

		body.appendChild(buildNameField(view, refreshSummary));
		body.appendChild(buildGroupsField(view, refreshSummary, {
			label: t('Groupes concernés'),
			emptyText: t('Aucun groupe : cette vue ne s’applique à personne.'),
			allTakenText: t('Tous les groupes trouvés sont déjà dans cette vue.'),
			conflictHint: function (groupId) {
				// Un groupe peut appartenir à plusieurs vues : les masquages se
				// cumulent alors. On le signale pour éviter la mauvaise surprise.
				var other = viewUsingGroup(groupId, view);
				return other ? tp('déjà dans « {view} »', { view: viewTitle(other) }) : null;
			}
		}));
		body.appendChild(buildEntriesField(view, refreshSummary));

		var remove = document.createElement('button');
		remove.type = 'button';
		remove.className = 'menucustom-admin-view-delete';
		remove.textContent = t('Supprimer la vue');
		remove.addEventListener('click', function () {
			removeView(view, card);
		});
		body.appendChild(remove);

		card.appendChild(body);
		return card;
	}

	function buildNameField(view, refreshSummary) {
		var field = document.createElement('div');
		field.className = 'menucustom-admin-field';

		var label = document.createElement('label');
		label.className = 'menucustom-admin-field-label';
		label.textContent = t('Nom de la vue');
		label.htmlFor = 'menucustom-view-name-' + view.id;

		var input = document.createElement('input');
		input.type = 'text';
		input.id = label.htmlFor;
		input.dataset.role = 'view-name';
		input.value = view.name;
		input.placeholder = t('Par exemple : École');
		input.addEventListener('input', function () {
			view.name = input.value;
			refreshSummary();
			scheduleSave();
		});

		field.appendChild(label);
		field.appendChild(input);
		return field;
	}

	/**
	 * Champ « groupes », partagé par les vues et les liens : les deux
	 * manipulent une liste de groupes, seuls les libellés diffèrent. Une vue
	 * masque des entrées à ses groupes, un lien réserve au contraire son
	 * affichage aux siens, d'où les textes passés dans `options`.
	 *
	 * @param {{id: string, groups: string[]}} holder vue ou lien à modifier
	 * @param {function} refreshSummary
	 * @param {{label: string, emptyText: string, allTakenText: string, conflictHint?: function}} options
	 */
	function buildGroupsField(holder, refreshSummary, options) {
		var field = document.createElement('div');
		field.className = 'menucustom-admin-field';

		var label = document.createElement('span');
		label.className = 'menucustom-admin-field-label';
		label.id = 'menucustom-groups-' + holder.id;
		label.textContent = options.label;
		field.appendChild(label);

		var chips = document.createElement('div');
		chips.className = 'menucustom-admin-chips';
		chips.dataset.role = 'chips';
		field.appendChild(chips);

		var autocomplete = buildGroupAutocomplete(holder, function () {
			renderChips();
			refreshSummary();
			scheduleSave();
		}, options);
		field.appendChild(autocomplete.element);

		function renderChips() {
			chips.innerHTML = '';

			if (!holder.groups.length) {
				var empty = document.createElement('span');
				empty.className = 'menucustom-admin-hint';
				empty.textContent = options.emptyText;
				chips.appendChild(empty);
				return;
			}

			holder.groups.forEach(function (groupId) {
				chips.appendChild(buildChip(holder, groupId, function () {
					renderChips();
					refreshSummary();
					autocomplete.refresh();
					scheduleSave();
				}));
			});
		}

		renderChips();
		return field;
	}

	function buildChip(holder, groupId, onRemove) {
		var chip = document.createElement('span');
		chip.className = 'menucustom-admin-chip';
		chip.dataset.groupId = groupId;

		var text = document.createElement('span');
		text.textContent = groupName(groupId);
		chip.appendChild(text);

		// Groupe supprimé de Nextcloud depuis : on le signale sans le retirer
		// d'office, l'admin reste maître de sa configuration.
		if (Object.prototype.hasOwnProperty.call(groupNames, groupId) === false) {
			chip.classList.add('menucustom-admin-chip--unknown');
			chip.title = t('Ce groupe n’existe plus dans Nextcloud.');
		}

		var remove = document.createElement('button');
		remove.type = 'button';
		remove.className = 'menucustom-admin-chip-remove';
		remove.setAttribute('aria-label', tp('Retirer le groupe {name}', { name: groupName(groupId) }));
		remove.textContent = '×';
		remove.addEventListener('click', function () {
			var index = holder.groups.indexOf(groupId);
			if (index !== -1) {
				holder.groups.splice(index, 1);
			}
			onRemove();
		});
		chip.appendChild(remove);

		return chip;
	}

	/**
	 * Champ de recherche de groupes avec suggestions (motif « combobox » ARIA) :
	 * flèches pour parcourir, Entrée pour ajouter, Échap pour fermer, Retour
	 * arrière sur un champ vide pour retirer le dernier groupe.
	 */
	function buildGroupAutocomplete(holder, onAdd, options) {
		var element = document.createElement('div');
		element.className = 'menucustom-admin-autocomplete';

		var listId = 'menucustom-suggestions-' + holder.id;

		var input = document.createElement('input');
		input.type = 'text';
		input.className = 'menucustom-admin-group-search';
		input.dataset.role = 'group-search';
		input.placeholder = t('Rechercher un groupe…');
		input.setAttribute('role', 'combobox');
		input.setAttribute('aria-expanded', 'false');
		input.setAttribute('aria-autocomplete', 'list');
		input.setAttribute('aria-controls', listId);
		input.setAttribute('aria-labelledby', 'menucustom-groups-' + holder.id);
		input.autocomplete = 'off';

		var list = document.createElement('ul');
		list.className = 'menucustom-admin-suggestions';
		list.id = listId;
		list.setAttribute('role', 'listbox');
		list.hidden = true;

		element.appendChild(input);
		element.appendChild(list);

		var suggestions = [];
		var activeIndex = -1;
		var searchTimer = null;
		var lastQuery = null;

		function close() {
			list.hidden = true;
			list.innerHTML = '';
			input.setAttribute('aria-expanded', 'false');
			input.removeAttribute('aria-activedescendant');
			suggestions = [];
			activeIndex = -1;
		}

		function setActive(index) {
			var options = qsa('li[role="option"]', list);
			if (!options.length) {
				return;
			}

			activeIndex = (index + options.length) % options.length;
			options.forEach(function (option, i) {
				var active = i === activeIndex;
				option.classList.toggle('menucustom-admin-suggestion--active', active);
				option.setAttribute('aria-selected', active ? 'true' : 'false');
				if (active) {
					input.setAttribute('aria-activedescendant', option.id);
					if (typeof option.scrollIntoView === 'function') {
						option.scrollIntoView({ block: 'nearest' });
					}
				}
			});
		}

		function add(group) {
			groupNames[group.id] = group.name;
			if (holder.groups.indexOf(group.id) === -1) {
				holder.groups.push(group.id);
			}
			input.value = '';
			lastQuery = null;
			close();
			onAdd();
			input.focus();
		}

		function render(results) {
			list.innerHTML = '';
			suggestions = results.filter(function (group) {
				return holder.groups.indexOf(group.id) === -1;
			});

			if (!suggestions.length) {
				var empty = document.createElement('li');
				empty.className = 'menucustom-admin-suggestion menucustom-admin-suggestion--empty';
				empty.textContent = results.length ? options.allTakenText : t('Aucun groupe trouvé.');
				list.appendChild(empty);
				list.hidden = false;
				input.setAttribute('aria-expanded', 'true');
				return;
			}

			suggestions.forEach(function (group, index) {
				var option = document.createElement('li');
				option.className = 'menucustom-admin-suggestion';
				option.id = listId + '-' + index;
				option.setAttribute('role', 'option');
				option.setAttribute('aria-selected', 'false');

				var name = document.createElement('span');
				name.textContent = group.name;
				option.appendChild(name);

				var conflict = options.conflictHint ? options.conflictHint(group.id) : null;
				if (conflict) {
					var hint = document.createElement('small');
					hint.className = 'menucustom-admin-suggestion-hint';
					hint.textContent = conflict;
					option.appendChild(hint);
				}

				// `mousedown` plutôt que `click` : le clic ferait perdre le focus
				// au champ avant que la sélection ne soit prise en compte.
				option.addEventListener('mousedown', function (event) {
					event.preventDefault();
					add(group);
				});

				list.appendChild(option);
			});

			list.hidden = false;
			input.setAttribute('aria-expanded', 'true');
			activeIndex = -1;
		}

		function search(query) {
			if (lastQuery === query && !list.hidden) {
				return;
			}
			lastQuery = query;

			if (Object.prototype.hasOwnProperty.call(searchCache, query)) {
				render(searchCache[query]);
				return;
			}

			fetch(url('/apps/' + APP_ID + '/groups') + '?search=' + encodeURIComponent(query) + '&limit=' + SEARCH_LIMIT, {
				method: 'GET',
				headers: requestHeaders(),
				credentials: 'same-origin'
			}).then(function (response) {
				if (!response.ok) {
					throw new Error('HTTP ' + response.status);
				}
				return response.json();
			}).then(function (data) {
				var results = (data && data.ocs ? data.ocs.data : data) || [];
				if (!Array.isArray(results)) {
					results = [];
				}
				results.forEach(function (group) {
					groupNames[group.id] = group.name;
				});
				searchCache[query] = results;

				// La frappe a pu continuer pendant la requête.
				if (lastQuery === query && document.activeElement === input) {
					render(results);
				}
			}).catch(function () {
				setStatus(t('Recherche de groupes indisponible, merci de réessayer.'), true);
				close();
			});
		}

		function scheduleSearch() {
			if (searchTimer) {
				clearTimeout(searchTimer);
			}
			var query = input.value.trim();
			searchTimer = setTimeout(function () {
				search(query);
			}, SEARCH_DEBOUNCE);
		}

		input.addEventListener('input', scheduleSearch);
		input.addEventListener('focus', scheduleSearch);
		input.addEventListener('blur', function () {
			// Laisse passer un éventuel `mousedown` sur une suggestion.
			setTimeout(close, 0);
		});

		input.addEventListener('keydown', function (event) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				if (list.hidden) {
					search(input.value.trim());
				} else {
					setActive(activeIndex + 1);
				}
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				setActive(activeIndex - 1);
			} else if (event.key === 'Enter') {
				if (!list.hidden && activeIndex >= 0 && suggestions[activeIndex]) {
					event.preventDefault();
					add(suggestions[activeIndex]);
				}
			} else if (event.key === 'Escape' || event.key === 'Esc') {
				if (!list.hidden) {
					event.stopPropagation();
					close();
				}
			} else if (event.key === 'Backspace' && input.value === '' && holder.groups.length) {
				holder.groups.pop();
				onAdd();
			}
		});

		return {
			element: element,
			refresh: function () {
				lastQuery = null;
			}
		};
	}

	/** Première autre vue à laquelle ce groupe est déjà associé, s'il y en a une. */
	function viewUsingGroup(groupId, exceptView) {
		for (var i = 0; i < config.views.length; i++) {
			var view = config.views[i];
			if (view !== exceptView && view.groups.indexOf(groupId) !== -1) {
				return view;
			}
		}
		return null;
	}

	function buildEntriesField(view, refreshSummary) {
		var field = document.createElement('fieldset');
		field.className = 'menucustom-admin-field';

		var legend = document.createElement('legend');
		legend.className = 'menucustom-admin-field-label';
		legend.textContent = t('Entrées masquées pour ces groupes');
		field.appendChild(legend);

		var list = document.createElement('ul');
		list.className = 'menucustom-admin-view-entries';
		list.dataset.role = 'view-entries';

		entries.forEach(function (entry) {
			var li = document.createElement('li');

			var label = document.createElement('label');

			var checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = view.hidden.indexOf(entry.id) !== -1;
			checkbox.addEventListener('change', function () {
				var index = view.hidden.indexOf(entry.id);
				if (checkbox.checked && index === -1) {
					view.hidden.push(entry.id);
				} else if (!checkbox.checked && index !== -1) {
					view.hidden.splice(index, 1);
				} else {
					return;
				}
				refreshSummary();
				scheduleSave();
			});

			var text = document.createElement('span');
			text.textContent = entry.name;

			label.appendChild(checkbox);
			label.appendChild(text);

			if (entry.known === false) {
				label.appendChild(unknownBadge());
			} else if (entry.type === 'link') {
				label.appendChild(linkBadge());
			}

			li.appendChild(label);
			list.appendChild(li);
		});

		field.appendChild(list);
		return field;
	}


	/* ------------------------------------------------------------------ *
	 * Liens personnalisés
	 * ------------------------------------------------------------------ */

	function buildLinks() {
		linksContainer.innerHTML = '';

		if (!config.links.length) {
			var empty = document.createElement('p');
			empty.className = 'menucustom-admin-hint';
			empty.textContent = t('Aucun lien pour le moment : le menu ne contient que des applications.');
			linksContainer.appendChild(empty);
			return;
		}

		config.links.forEach(function (link) {
			linksContainer.appendChild(buildLink(link, false));
		});
	}

	function addLink() {
		linkSequence++;
		var link = {
			id: 'link-' + Date.now().toString(36) + '-' + linkSequence,
			name: '',
			url: '',
			icon: '',
			newTab: true,
			groups: []
		};
		config.links.push(link);

		var hint = linksContainer.querySelector('.menucustom-admin-hint');
		if (hint) {
			hint.remove();
		}

		var card = buildLink(link, true);
		linksContainer.appendChild(card);
		card.querySelector('[data-role="link-name"]').focus();

		syncOrderList();
		// Les listes d'entrées à masquer des vues sont figées à leur
		// construction : les rebâtir pour que le lien y soit immédiatement
		// cochable.
		buildViews();
		scheduleSave();
	}

	function removeLink(link, card) {
		var index = config.links.indexOf(link);
		if (index !== -1) {
			config.links.splice(index, 1);
		}
		card.remove();

		// L'identifiant ne désigne plus rien : le retirer des réglages qui le
		// citent, sinon il réapparaîtrait signalé comme « app absente ».
		forget(config.order, link.id);
		forget(config.hidden, link.id);
		config.views.forEach(function (view) {
			forget(view.hidden, link.id);
		});

		if (!config.links.length) {
			buildLinks();
		}

		syncOrderList();
		buildViews();
		scheduleSave();
	}

	function forget(list, id) {
		var index = list.indexOf(id);
		if (index !== -1) {
			list.splice(index, 1);
		}
	}

	/**
	 * Répercute les liens sur la liste « Ordre et visibilité ». Celle-ci est
	 * construite à partir d'`entries`, que le serveur ne fournit qu'au
	 * chargement : il faut donc la tenir à jour au fil des ajouts, renommages
	 * et suppressions pour que le lien s'y range immédiatement.
	 */
	function syncOrderList() {
		var byId = {};
		config.links.forEach(function (link) {
			byId[link.id] = link;
		});

		entries = entries.filter(function (entry) {
			return entry.type !== 'link' || Object.prototype.hasOwnProperty.call(byId, entry.id);
		});

		var listed = {};
		entries.forEach(function (entry) {
			if (entry.type === 'link') {
				entry.name = linkTitle(byId[entry.id]);
				listed[entry.id] = true;
			}
		});

		config.links.forEach(function (link) {
			if (!listed[link.id]) {
				entries.push({ id: link.id, name: linkTitle(link), known: true, type: 'link' });
			}
		});

		buildOrderList();
	}

	function linkTitle(link) {
		return (link && link.name) || t('Lien sans nom');
	}

	function linkMeta(link) {
		// Le serveur écarte un lien sans nom ni adresse plutôt que de publier une
		// entrée cassée dans le menu de tout le monde : autant le dire ici.
		if (!link.name || !link.url) {
			return t('incomplet — tant qu’il manque le nom ou l’adresse, ce lien n’est pas enregistré');
		}

		var parts = [link.url];
		parts.push(link.newTab ? t('nouvel onglet') : t('onglet courant'));

		if (link.groups.length) {
			parts.push(link.groups.length === 1
				? t('1 groupe')
				: tp('{count} groupes', { count: link.groups.length }));
		}

		return parts.join(' · ');
	}

	function buildLink(link, open) {
		var card = document.createElement('details');
		card.className = 'menucustom-admin-view menucustom-admin-link';
		card.dataset.linkId = link.id;
		card.open = !!open;

		var summary = document.createElement('summary');

		var title = document.createElement('span');
		title.className = 'menucustom-admin-view-title';
		title.textContent = linkTitle(link);

		var meta = document.createElement('span');
		meta.className = 'menucustom-admin-view-meta';
		meta.textContent = linkMeta(link);

		summary.appendChild(title);
		summary.appendChild(meta);
		card.appendChild(summary);

		var refreshSummary = function () {
			title.textContent = linkTitle(link);
			meta.textContent = linkMeta(link);
		};

		var body = document.createElement('div');
		body.className = 'menucustom-admin-view-body';

		var icon = buildIconField(link);

		body.appendChild(buildTextField(link, 'name', {
			role: 'link-name',
			label: t('Nom affiché'),
			placeholder: t('Par exemple : Intranet'),
			onInput: function () {
				refreshSummary();
				icon.refresh();
				syncOrderList();
			}
		}));

		body.appendChild(buildTextField(link, 'url', {
			role: 'link-url',
			type: 'url',
			label: t('Adresse'),
			placeholder: 'https://intranet.exemple.fr/',
			hint: t('Adresse complète en http(s), ou chemin interne commençant par « / ».'),
			onInput: refreshSummary
		}));

		body.appendChild(icon.element);
		body.appendChild(buildNewTabField(link, refreshSummary));

		body.appendChild(buildGroupsField(link, refreshSummary, {
			label: t('Réservé à ces groupes'),
			emptyText: t('Aucun groupe : le lien est visible par tout le monde.'),
			allTakenText: t('Tous les groupes trouvés sont déjà associés à ce lien.')
		}));

		var remove = document.createElement('button');
		remove.type = 'button';
		remove.className = 'menucustom-admin-view-delete';
		remove.textContent = t('Supprimer le lien');
		remove.addEventListener('click', function () {
			removeLink(link, card);
		});
		body.appendChild(remove);

		card.appendChild(body);
		return card;
	}

	function buildTextField(holder, property, options) {
		var field = document.createElement('div');
		field.className = 'menucustom-admin-field';

		var label = document.createElement('label');
		label.className = 'menucustom-admin-field-label';
		label.textContent = options.label;
		label.htmlFor = 'menucustom-' + options.role + '-' + holder.id;

		var input = document.createElement('input');
		input.type = options.type || 'text';
		input.id = label.htmlFor;
		input.dataset.role = options.role;
		input.value = holder[property];
		input.placeholder = options.placeholder || '';
		input.addEventListener('input', function () {
			holder[property] = input.value;
			if (options.onInput) {
				options.onInput();
			}
			scheduleSave();
		});

		field.appendChild(label);
		field.appendChild(input);

		if (options.hint) {
			var hint = document.createElement('small');
			hint.className = 'menucustom-admin-hint';
			hint.textContent = options.hint;
			field.appendChild(hint);
		}

		return field;
	}

	function buildNewTabField(link, refreshSummary) {
		var field = document.createElement('div');
		field.className = 'menucustom-admin-field';

		var label = document.createElement('label');
		label.className = 'menucustom-admin-checkbox';

		var checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.dataset.role = 'link-new-tab';
		checkbox.checked = !!link.newTab;
		checkbox.addEventListener('change', function () {
			link.newTab = checkbox.checked;
			refreshSummary();
			scheduleSave();
		});

		var text = document.createElement('span');
		text.textContent = t('Ouvrir dans un nouvel onglet');

		label.appendChild(checkbox);
		label.appendChild(text);
		field.appendChild(label);

		return field;
	}

	/**
	 * Champ « icône » : une URL saisie, ou un fichier téléversé et servi par
	 * l'app. Sans icône, le tiroir affiche l'initiale du nom — l'aperçu montre
	 * donc le même repli.
	 *
	 * @return {{element: HTMLElement, refresh: function}}
	 */
	function buildIconField(link) {
		var field = document.createElement('div');
		field.className = 'menucustom-admin-field';

		var label = document.createElement('label');
		label.className = 'menucustom-admin-field-label';
		label.textContent = t('Icône');
		label.htmlFor = 'menucustom-link-icon-' + link.id;
		field.appendChild(label);

		var row = document.createElement('div');
		row.className = 'menucustom-admin-icon-row';

		var preview = document.createElement('span');
		preview.className = 'menucustom-admin-icon-preview';
		preview.setAttribute('aria-hidden', 'true');

		var input = document.createElement('input');
		input.type = 'text';
		input.id = label.htmlFor;
		input.dataset.role = 'link-icon';

		var file = document.createElement('input');
		file.type = 'file';
		file.accept = 'image/svg+xml,image/png,image/jpeg,image/webp';
		file.hidden = true;

		var upload = document.createElement('button');
		upload.type = 'button';
		upload.className = 'menucustom-admin-icon-button';
		upload.textContent = t('Téléverser…');
		upload.addEventListener('click', function () {
			file.click();
		});

		var clear = document.createElement('button');
		clear.type = 'button';
		clear.className = 'menucustom-admin-icon-button';
		clear.textContent = t('Retirer');
		clear.addEventListener('click', function () {
			link.icon = '';
			syncInput();
			refresh();
			scheduleSave();
		});

		row.appendChild(preview);
		row.appendChild(input);
		row.appendChild(upload);
		row.appendChild(clear);
		row.appendChild(file);
		field.appendChild(row);

		// L'aperçu seul : ne touche pas au champ, qui peut être en cours de
		// saisie — y réécrire la valeur déplacerait le curseur.
		function refresh() {
			preview.innerHTML = '';

			var src = iconUrl(link.icon);
			if (src) {
				var image = document.createElement('img');
				image.src = src;
				image.alt = '';
				preview.appendChild(image);
			} else {
				preview.textContent = (link.name || '?').charAt(0).toUpperCase();
			}

			clear.hidden = !link.icon;
		}

		function syncInput() {
			// Un fichier téléversé n'a pas d'URL à montrer : le champ reste vide
			// et sert alors à le remplacer par une adresse.
			var uploaded = isUploadedIcon(link.icon);
			input.value = uploaded ? '' : link.icon;
			input.placeholder = uploaded
				? t('Fichier téléversé — saisissez une adresse pour le remplacer')
				: t('Adresse d’une image (facultatif)');
		}

		input.addEventListener('input', function () {
			link.icon = input.value.trim();
			refresh();
			scheduleSave();
		});

		file.addEventListener('change', function () {
			if (file.files && file.files.length) {
				uploadIcon(link, file.files[0], function () {
					syncInput();
					refresh();
				});
			}
			// Permet de re-sélectionner le même fichier après un échec.
			file.value = '';
		});

		syncInput();
		refresh();

		return { element: field, refresh: refresh };
	}

	function isUploadedIcon(icon) {
		return typeof icon === 'string' && icon.indexOf(ICON_UPLOAD_PREFIX) === 0;
	}

	/** Décalque `MenuConfigService::resolveIconUrl()` côté navigateur. */
	function iconUrl(icon) {
		if (!icon) {
			return '';
		}

		if (isUploadedIcon(icon)) {
			return url('/apps/' + APP_ID + '/icon/' + icon.slice(ICON_UPLOAD_PREFIX.length));
		}

		return icon;
	}

	function uploadIcon(link, blob, done) {
		if (blob.size > MAX_ICON_SIZE) {
			setStatus(t('Icône trop volumineuse : 256 Kio au maximum.'), true);
			return;
		}

		var body = new FormData();
		body.append('icon', blob);

		setStatus(t('Envoi de l’icône…'), false);

		// Pas de `Content-Type` ici : le navigateur doit poser lui-même la
		// frontière du corps multipart.
		fetch(url('/apps/' + APP_ID + '/icon'), {
			method: 'POST',
			headers: requestHeaders(),
			credentials: 'same-origin',
			body: body
		}).then(function (response) {
			return response.json().catch(function () {
				return {};
			}).then(function (data) {
				if (!response.ok) {
					throw new Error(data.message || ('HTTP ' + response.status));
				}
				return data;
			});
		}).then(function (data) {
			link.icon = data.icon;
			done();
			scheduleSave();
		}).catch(function (error) {
			setStatus(error.message || t('Envoi de l’icône impossible.'), true);
		});
	}

	/* ------------------------------------------------------------------ *
	 * Enregistrement
	 * ------------------------------------------------------------------ */

	function scheduleSave() {
		setStatus(t('Enregistrement…'), false);
		if (saveTimer) {
			clearTimeout(saveTimer);
		}
		saveTimer = setTimeout(save, SAVE_DEBOUNCE);
	}

	function save() {
		saveTimer = null;

		var headers = requestHeaders();
		headers['Content-Type'] = 'application/json';

		fetch(url('/apps/' + APP_ID + '/settings'), {
			method: 'POST',
			headers: headers,
			credentials: 'same-origin',
			body: JSON.stringify({
				order: config.order,
				hidden: config.hidden,
				views: config.views,
				links: config.links,
				scope: config.scope
			})
		}).then(function (response) {
			if (!response.ok) {
				throw new Error('HTTP ' + response.status);
			}
			setStatus(t('Réglages enregistrés. Ils s’appliquent au prochain chargement de page des utilisateurs concernés.'), false);
		}).catch(function () {
			setStatus(t('Échec de l’enregistrement, merci de réessayer.'), true);
		});
	}

	function setStatus(message, isError) {
		if (!statusEl) {
			return;
		}
		statusEl.textContent = message;
		statusEl.classList.toggle('menucustom-admin-status-error', !!isError);
	}

	/* ------------------------------------------------------------------ *
	 * Amorçage
	 * ------------------------------------------------------------------ */

	function init() {
		root = document.getElementById('menucustom-admin');
		if (!root) {
			return;
		}

		orderList = root.querySelector('[data-role="order-list"]');
		scopeList = root.querySelector('[data-role="scope-list"]');
		viewsContainer = root.querySelector('[data-role="views"]');
		linksContainer = root.querySelector('[data-role="links"]');
		statusEl = root.querySelector('[data-role="status"]');

		entries = loadState('entries', []);

		(loadState('groups', []) || []).forEach(function (group) {
			if (group.known !== false) {
				groupNames[group.id] = group.name;
			}
		});

		var loaded = loadState('config', null);
		config = {
			order: (loaded && loaded.order) || [],
			hidden: (loaded && loaded.hidden) || [],
			views: (loaded && loaded.views) || [],
			links: (loaded && loaded.links) || [],
			scope: (loaded && loaded.scope) || DEFAULT_SCOPE
		};

		buildScopeList();

		var addViewButton = root.querySelector('[data-role="add-view"]');
		if (addViewButton) {
			addViewButton.addEventListener('click', addView);
		}

		var addLinkButton = root.querySelector('[data-role="add-link"]');
		if (addLinkButton) {
			addLinkButton.addEventListener('click', addLink);
		}

		buildLinks();
		buildViews();
		// Construit la liste d'ordre, en réconciliant au passage les entrées
		// reçues du serveur avec les liens configurés.
		syncOrderList();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
