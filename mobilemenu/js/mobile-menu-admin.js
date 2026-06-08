/**
 * Écran de réglages admin de Mobile Menu : permet de réordonner les entrées
 * du tiroir mobile, de les masquer globalement, et de les masquer pour des
 * groupes d'utilisateurs spécifiques (ex. masquer « Deck » pour le groupe
 * « Responsables »).
 *
 * Vanilla JS, sans dépendance de build, à l'image de mobile-menu.js.
 */
(function () {
	'use strict';

	var APP_ID = 'mobilemenu';
	var SAVE_DEBOUNCE = 600;

	var entries = [];
	var groups = [];
	var config = { order: [], hidden: [], groupHidden: {} };

	var orderList = null;
	var groupSelect = null;
	var groupList = null;
	var statusEl = null;

	var saveTimer = null;
	var draggedItem = null;

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

		sortByOrder(entries, config.order).forEach(function (entry) {
			var li = document.createElement('li');
			li.className = 'mobilemenu-admin-order-item';
			li.draggable = true;
			li.dataset.id = entry.id;

			var handle = document.createElement('span');
			handle.className = 'mobilemenu-admin-drag-handle';
			handle.setAttribute('aria-hidden', 'true');
			handle.textContent = '⠿';

			var label = document.createElement('label');
			label.className = 'mobilemenu-admin-order-label';

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

			var controls = document.createElement('span');
			controls.className = 'mobilemenu-admin-order-controls';

			var up = document.createElement('button');
			up.type = 'button';
			up.className = 'mobilemenu-admin-order-move';
			up.setAttribute('aria-label', t('Monter'));
			up.textContent = '↑';
			up.addEventListener('click', function () {
				moveItem(li, -1);
			});

			var down = document.createElement('button');
			down.type = 'button';
			down.className = 'mobilemenu-admin-order-move';
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
		draggedItem.classList.add('mobilemenu-admin-dragging');
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
			draggedItem.classList.remove('mobilemenu-admin-dragging');
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

	function buildGroupSelect() {
		groupSelect.innerHTML = '';

		var placeholder = document.createElement('option');
		placeholder.value = '';
		placeholder.textContent = t('— Choisir un groupe —');
		groupSelect.appendChild(placeholder);

		groups.forEach(function (group) {
			var option = document.createElement('option');
			option.value = group.id;
			option.textContent = group.name;
			groupSelect.appendChild(option);
		});

		groupSelect.addEventListener('change', function () {
			buildGroupList(groupSelect.value);
		});

		buildGroupList('');
	}

	function buildGroupList(groupId) {
		groupList.innerHTML = '';

		if (!groupId) {
			var hint = document.createElement('li');
			hint.className = 'mobilemenu-admin-hint';
			hint.textContent = t('Choisissez un groupe ci-dessus pour configurer les entrées à lui masquer.');
			groupList.appendChild(hint);
			return;
		}

		var hiddenForGroup = config.groupHidden[groupId] || [];

		entries.forEach(function (entry) {
			var li = document.createElement('li');
			li.className = 'mobilemenu-admin-group-item';

			var label = document.createElement('label');

			var checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = hiddenForGroup.indexOf(entry.id) !== -1;
			checkbox.addEventListener('change', function () {
				setGroupHidden(groupId, entry.id, checkbox.checked);
			});

			var text = document.createElement('span');
			text.textContent = entry.name;

			label.appendChild(checkbox);
			label.appendChild(text);
			li.appendChild(label);

			groupList.appendChild(li);
		});
	}

	function setGroupHidden(groupId, entryId, hidden) {
		var list = config.groupHidden[groupId] ? config.groupHidden[groupId].slice() : [];
		var index = list.indexOf(entryId);

		if (hidden && index === -1) {
			list.push(entryId);
		} else if (!hidden && index !== -1) {
			list.splice(index, 1);
		} else {
			return;
		}

		if (list.length) {
			config.groupHidden[groupId] = list;
		} else {
			delete config.groupHidden[groupId];
		}

		scheduleSave();
	}

	function scheduleSave() {
		setStatus(t('Enregistrement…'), false);
		if (saveTimer) {
			clearTimeout(saveTimer);
		}
		saveTimer = setTimeout(save, SAVE_DEBOUNCE);
	}

	function save() {
		saveTimer = null;

		var url = (typeof window.OC !== 'undefined' && typeof window.OC.generateUrl === 'function')
			? window.OC.generateUrl('/apps/' + APP_ID + '/settings')
			: '/apps/' + APP_ID + '/settings';

		var headers = {
			'Content-Type': 'application/json',
			'Accept': 'application/json'
		};
		if (typeof window.OC !== 'undefined' && window.OC.requestToken) {
			headers.requesttoken = window.OC.requestToken;
		}

		fetch(url, {
			method: 'POST',
			headers: headers,
			credentials: 'same-origin',
			body: JSON.stringify({
				order: config.order,
				hidden: config.hidden,
				groupHidden: config.groupHidden
			})
		}).then(function (response) {
			if (!response.ok) {
				throw new Error('HTTP ' + response.status);
			}
			setStatus(t('Réglages enregistrés.'), false);
		}).catch(function () {
			setStatus(t('Échec de l\'enregistrement, merci de réessayer.'), true);
		});
	}

	function setStatus(message, isError) {
		if (!statusEl) {
			return;
		}
		statusEl.textContent = message;
		statusEl.classList.toggle('mobilemenu-admin-status-error', !!isError);
	}

	function init() {
		var root = document.getElementById('mobilemenu-admin');
		if (!root) {
			return;
		}

		orderList = root.querySelector('[data-role="order-list"]');
		groupSelect = root.querySelector('[data-role="group-select"]');
		groupList = root.querySelector('[data-role="group-list"]');
		statusEl = root.querySelector('[data-role="status"]');

		entries = loadState('entries', []);
		groups = loadState('groups', []);

		var loadedConfig = loadState('config', null);
		config = {
			order: (loadedConfig && loadedConfig.order) || [],
			hidden: (loadedConfig && loadedConfig.hidden) || [],
			groupHidden: (loadedConfig && loadedConfig.groupHidden) || {}
		};

		if (!entries.length) {
			var empty = document.createElement('li');
			empty.className = 'mobilemenu-admin-hint';
			empty.textContent = t('Aucune entrée de menu détectée.');
			orderList.appendChild(empty);
			return;
		}

		buildOrderList();
		buildGroupSelect();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
