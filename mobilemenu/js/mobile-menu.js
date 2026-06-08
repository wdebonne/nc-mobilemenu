/**
 * Mobile Menu — ajoute un bouton hamburger et un tiroir de navigation
 * coulissant à la barre du haut de Nextcloud sur mobile et tablette.
 *
 * Le script ne modifie jamais le DOM natif de Nextcloud : il clone les liens
 * existants du menu d'apps et du menu utilisateur dans son propre tiroir,
 * pour rester robuste face aux mises à jour / re-rendus Vue du header.
 */
(function () {
	'use strict';

	var BREAKPOINT = '(max-width: 1024px)';
	var mediaQuery = window.matchMedia(BREAKPOINT);

	var toggleButton = null;
	var overlay = null;
	var drawer = null;
	var initialized = false;

	var menuConfig;

	function qs(selector, context) {
		return (context || document).querySelector(selector);
	}

	function qsa(selector, context) {
		return Array.prototype.slice.call((context || document).querySelectorAll(selector));
	}

	/**
	 * Configuration d'ordre/masquage du menu fournie par le serveur (réglages
	 * admin de l'app), propre à l'utilisateur courant. Mise en cache car
	 * `populateDrawer` peut être appelée plusieurs fois (à chaque ouverture).
	 */
	function getMenuConfig() {
		if (menuConfig !== undefined) {
			return menuConfig;
		}

		menuConfig = null;
		if (typeof window.OCP !== 'undefined' && window.OCP.InitialState && typeof window.OCP.InitialState.loadState === 'function') {
			try {
				menuConfig = window.OCP.InitialState.loadState('mobilemenu', 'menuConfig', null);
			} catch (e) {
				menuConfig = null;
			}
		}

		return menuConfig;
	}

	/**
	 * Identifie l'app à laquelle correspond une entrée de menu (élément de
	 * liste ou lien), en essayant plusieurs attributs/heuristiques pour
	 * rester robuste face aux variations entre versions/thèmes de Nextcloud.
	 */
	function getEntryAppId(item) {
		// L'identifiant peut se trouver sur l'élément lui-même (lien/bouton)
		// ou sur son <li> englobant, selon la structure du menu d'origine.
		var candidates = [item];
		var listItem = item.closest && item.closest('li');
		if (listItem && listItem !== item) {
			candidates.push(listItem);
		}

		for (var i = 0; i < candidates.length; i++) {
			var el = candidates[i];
			if (el.dataset && el.dataset.id) {
				return el.dataset.id;
			}
			if (el.dataset && el.dataset.appId) {
				return el.dataset.appId;
			}
		}

		var link = item.matches && item.matches('a, button') ? item : qs('a, button', item);
		if (!link) {
			return null;
		}

		var href = link.getAttribute && link.getAttribute('href');
		if (href) {
			var match = href.match(/\/apps\/([^/?#]+)/);
			if (match) {
				return match[1];
			}
		}

		if (link.id) {
			return link.id.replace(/^appmenu[-_]?/, '');
		}

		return null;
	}

	/**
	 * Filtre les entrées masquées et applique l'ordre personnalisé défini
	 * dans les réglages admin (les entrées non listées gardent leur ordre
	 * d'origine et sont placées après celles qui sont explicitement ordonnées).
	 */
	function applyMenuConfig(items) {
		var config = getMenuConfig();
		if (!config) {
			return items;
		}

		var hidden = config.hidden || [];
		var order = config.order || [];

		var visible = items.filter(function (item) {
			var appId = getEntryAppId(item);
			return !appId || hidden.indexOf(appId) === -1;
		});

		if (!order.length) {
			return visible;
		}

		var orderIndex = {};
		order.forEach(function (appId, index) {
			orderIndex[appId] = index;
		});

		return visible
			.map(function (item, naturalIndex) {
				var appId = getEntryAppId(item);
				var hasOrder = appId !== null && Object.prototype.hasOwnProperty.call(orderIndex, appId);
				return {
					item: item,
					sortKey: hasOrder ? orderIndex[appId] : (order.length + naturalIndex),
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
				return wrapped.item;
			});
	}

	/**
	 * Construit une section du tiroir à partir des liens d'un menu existant,
	 * en clonant les éléments (sans jamais toucher au DOM original).
	 */
	function buildSection(title, sourceSelector, itemSelector, options) {
		var source = qs(sourceSelector);
		if (!source) {
			return null;
		}

		var items = qsa(itemSelector, source);
		if (!items.length) {
			return null;
		}

		if (options && options.applyMenuConfig) {
			items = applyMenuConfig(items);
			if (!items.length) {
				return null;
			}
		}

		var section = document.createElement('section');
		section.className = 'mobilemenu-section';

		var heading = document.createElement('h2');
		heading.textContent = title;
		section.appendChild(heading);

		var list = document.createElement('ul');
		items.forEach(function (item) {
			var clone = item.cloneNode(true);
			clone.removeAttribute('id');
			qsa('[id]', clone).forEach(function (el) {
				el.removeAttribute('id');
			});

			var li = document.createElement('li');
			li.appendChild(clone);
			list.appendChild(li);
		});

		section.appendChild(list);
		return section;
	}

	function populateDrawer() {
		if (!drawer) {
			return;
		}

		drawer.innerHTML = '';

		var sections = [
			buildSection(t('Applications'), '#appmenu', 'li > a', { applyMenuConfig: true }),
			buildSection(t('Compte'), '#user-menu, #settings #expand', 'a, button')
		];

		var hasContent = false;
		sections.forEach(function (section) {
			if (section) {
				drawer.appendChild(section);
				hasContent = true;
			}
		});

		if (!hasContent) {
			var empty = document.createElement('p');
			empty.className = 'mobilemenu-empty';
			empty.textContent = t('Aucun élément de menu disponible');
			drawer.appendChild(empty);
		}
	}

	/**
	 * Traduction minimale sans dépendance : Nextcloud expose `t()` globalement
	 * pour les scripts chargés via addScript ; on reste défensif si absent.
	 */
	function t(text) {
		if (typeof window.t === 'function') {
			try {
				return window.t('mobilemenu', text);
			} catch (e) {
				return text;
			}
		}
		return text;
	}

	function openDrawer() {
		populateDrawer();
		document.body.classList.add('mobilemenu-open');
		toggleButton.setAttribute('aria-expanded', 'true');
		drawer.setAttribute('aria-hidden', 'false');

		document.addEventListener('keydown', onKeydown);
		overlay.addEventListener('click', closeDrawer);

		var firstLink = qs('a, button', drawer);
		if (firstLink) {
			firstLink.focus();
		}
	}

	function closeDrawer() {
		if (!document.body.classList.contains('mobilemenu-open')) {
			return;
		}

		document.body.classList.remove('mobilemenu-open');
		toggleButton.setAttribute('aria-expanded', 'false');
		drawer.setAttribute('aria-hidden', 'true');

		document.removeEventListener('keydown', onKeydown);
		overlay.removeEventListener('click', closeDrawer);

		toggleButton.focus();
	}

	function isOpen() {
		return document.body.classList.contains('mobilemenu-open');
	}

	function onKeydown(event) {
		if (event.key === 'Escape' || event.key === 'Esc') {
			closeDrawer();
		}
	}

	function onToggleClick() {
		if (isOpen()) {
			closeDrawer();
		} else {
			openDrawer();
		}
	}

	function onDrawerClick(event) {
		var link = event.target.closest('a, button');
		if (link) {
			closeDrawer();
		}
	}

	function onMediaChange(event) {
		if (!event.matches && isOpen()) {
			closeDrawer();
		}
	}

	function buildUI(header) {
		toggleButton = document.createElement('button');
		toggleButton.type = 'button';
		toggleButton.className = 'mobilemenu-toggle';
		toggleButton.setAttribute('aria-label', t('Ouvrir le menu de navigation'));
		toggleButton.setAttribute('aria-expanded', 'false');
		toggleButton.setAttribute('aria-controls', 'mobilemenu-drawer');
		for (var i = 0; i < 3; i++) {
			var bar = document.createElement('span');
			bar.className = 'mobilemenu-bar';
			bar.setAttribute('aria-hidden', 'true');
			toggleButton.appendChild(bar);
		}
		toggleButton.addEventListener('click', onToggleClick);

		overlay = document.createElement('div');
		overlay.className = 'mobilemenu-overlay';
		overlay.setAttribute('aria-hidden', 'true');

		drawer = document.createElement('nav');
		drawer.id = 'mobilemenu-drawer';
		drawer.className = 'mobilemenu-drawer';
		drawer.setAttribute('role', 'dialog');
		drawer.setAttribute('aria-label', t('Menu de navigation'));
		drawer.setAttribute('aria-hidden', 'true');
		drawer.addEventListener('click', onDrawerClick);

		header.insertBefore(toggleButton, header.firstChild);
		document.body.appendChild(overlay);
		document.body.appendChild(drawer);

		mediaQuery.addEventListener('change', onMediaChange);
	}

	function init() {
		if (initialized) {
			return;
		}

		var header = qs('#header');
		if (!header) {
			return;
		}

		buildUI(header);
		initialized = true;
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
