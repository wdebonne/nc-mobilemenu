/**
 * Mobile Menu — ajoute un bouton hamburger et un tiroir de navigation
 * coulissant à la barre du haut de Nextcloud sur mobile et tablette.
 *
 * Le script ne modifie jamais le contenu du DOM natif de Nextcloud : il clone
 * les liens existants du menu d'apps et du menu utilisateur dans son propre
 * tiroir, pour rester robuste face aux mises à jour / re-rendus Vue du header.
 * Seule exception : le popover « plus d'applications » étant un composant Vue
 * dont le contenu n'est monté que pendant son ouverture, le script l'ouvre et
 * le referme une fois, brièvement et masqué via CSS, pour en cloner les liens
 * (résultat mis en cache pour ne le faire qu'une seule fois par session).
 */
(function () {
	'use strict';

	var BREAKPOINT = '(max-width: 1024px)';
	var mediaQuery = window.matchMedia(BREAKPOINT);

	var toggleButton = null;
	var overlay = null;
	var drawer = null;
	var initialized = false;

	// Apps masquées selon la configuration admin (par groupe utilisateur)
	var hiddenApps = (function () {
		try {
			var el = document.getElementById('initial-state-mobilemenu-hidden_apps');
			return el ? JSON.parse(atob(el.value)) : [];
		} catch (e) {
			return [];
		}
	}());

	function getAppIdFromLink(link) {
		var href = (link && (link.getAttribute('href') || link.href)) || '';
		var match = href.match(/\/apps\/([^\/\?#]+)/);
		return match ? match[1] : null;
	}

	function isAppHidden(item) {
		if (!hiddenApps.length) return false;
		var link = item.tagName === 'A' ? item : item.querySelector('a');
		var appId = link ? getAppIdFromLink(link) : null;
		return appId ? hiddenApps.indexOf(appId) !== -1 : false;
	}

	function qs(selector, context) {
		return (context || document).querySelector(selector);
	}

	function qsa(selector, context) {
		return Array.prototype.slice.call((context || document).querySelectorAll(selector));
	}

	/**
	 * Construit une section du tiroir à partir d'éléments déjà obtenus
	 * (clonés depuis un menu existant, sans jamais toucher au DOM original).
	 */
	/**
	 * Les icônes d'applications sont des silhouettes monochromes appliquées en
	 * `background-image`, prévues pour le fond de la barre du haut (couleur
	 * fixe, souvent blanche). Une fois clonées sur le fond clair du tiroir,
	 * elles peuvent devenir illisibles (blanc sur blanc). On les convertit en
	 * masques CSS teintés avec `--color-main-text`, la couleur de texte du
	 * thème courant : elles restent ainsi lisibles aussi bien en thème clair
	 * (silhouette sombre) qu'en thème sombre (silhouette claire), sans avoir à
	 * détecter le thème nous-mêmes.
	 */
	function recolorIcon(icon) {
		var image = icon.style.backgroundImage;
		if (!image || image === 'none') {
			return;
		}

		icon.style.backgroundImage = 'none';
		icon.style.webkitMaskImage = image;
		icon.style.maskImage = image;
		icon.style.webkitMaskRepeat = 'no-repeat';
		icon.style.maskRepeat = 'no-repeat';
		icon.style.webkitMaskPosition = 'center';
		icon.style.maskPosition = 'center';
		icon.style.webkitMaskSize = 'contain';
		icon.style.maskSize = 'contain';
		icon.style.backgroundColor = 'var(--color-main-text)';
	}

	function buildSectionFromItems(items) {
		if (!items || !items.length) {
			return null;
		}

		var section = document.createElement('section');
		section.className = 'mobilemenu-section';

		var list = document.createElement('ul');
		items.forEach(function (item) {
			if (isAppHidden(item)) return;

			var clone = item.cloneNode(true);
			clone.removeAttribute('id');
			qsa('[id]', clone).forEach(function (el) {
				el.removeAttribute('id');
			});
			qsa('.action-link__icon--url', clone).forEach(recolorIcon);

			var li = document.createElement('li');
			li.appendChild(clone);
			list.appendChild(li);
		});

		section.appendChild(list);
		return section;
	}

	/**
	 * Construit une section du tiroir à partir des liens d'un menu existant
	 * et toujours présent dans le DOM (sans jamais toucher au DOM original).
	 */
	function buildSection(sourceSelector, itemSelector) {
		var source = qs(sourceSelector);
		if (!source) {
			return null;
		}

		return buildSectionFromItems(qsa(itemSelector, source));
	}

	/**
	 * Le menu « plus d'applications » (#appmenu .app-menu__overflow) est un
	 * popover Vue dont le contenu (.app-menu__overflow-entry) n'existe dans le
	 * DOM que pendant qu'il est ouvert. On l'ouvre donc une fois, brièvement et
	 * masqué via CSS (.mobilemenu-harvesting), pour cloner ses liens, puis on le
	 * referme — le résultat est mis en cache pour ne le faire qu'une seule fois.
	 */
	var overflowLinksCache = null;
	var overflowHarvestDone = false;

	/**
	 * Referme le popover « plus d'applications » après la récolte. Un simple
	 * second clic sur le déclencheur peut entrer en compétition avec la
	 * détection « clic extérieur » du popover (la rouvrant aussitôt) : on
	 * essaie donc plusieurs mécanismes de fermeture dans l'ordre, en vérifiant
	 * `aria-expanded` après chacun, jusqu'à ce qu'il repasse à `false`.
	 */
	function closeOverflowPopover(trigger, done) {
		if (trigger.getAttribute('aria-expanded') !== 'true') {
			done();
			return;
		}

		var strategies = [
			function () {
				document.dispatchEvent(new KeyboardEvent('keydown', {
					key: 'Escape',
					code: 'Escape',
					keyCode: 27,
					which: 27,
					bubbles: true
				}));
			},
			function () {
				var backdrop = qs('.action-item__popper .v-popper__backdrop');
				if (backdrop) {
					backdrop.click();
				}
			},
			function () {
				trigger.click();
			}
		];

		var index = 0;

		function tryNext() {
			if (trigger.getAttribute('aria-expanded') !== 'true') {
				done();
				return;
			}
			if (index >= strategies.length) {
				done();
				return;
			}
			strategies[index]();
			index += 1;
			setTimeout(tryNext, 80);
		}

		tryNext();
	}

	function harvestOverflowLinks(callback) {
		if (overflowHarvestDone) {
			callback(overflowLinksCache || []);
			return;
		}

		var trigger = qs('.app-menu__overflow .action-item__menutoggle');
		if (!trigger) {
			overflowHarvestDone = true;
			callback([]);
			return;
		}

		var wasOpen = trigger.getAttribute('aria-expanded') === 'true';
		var settled = false;
		var safetyTimer = null;

		var observer = new MutationObserver(function () {
			var links = qsa('.app-menu__overflow-entry > a');
			if (links.length) {
				finish(links);
			}
		});

		function finish(liveLinks) {
			if (settled) {
				return;
			}
			settled = true;

			observer.disconnect();
			clearTimeout(safetyTimer);

			var clones = liveLinks.map(function (link) {
				return link.cloneNode(true);
			});

			overflowHarvestDone = true;
			overflowLinksCache = clones.length ? clones : null;

			function reveal() {
				document.body.classList.remove('mobilemenu-harvesting');
				callback(clones);
			}

			if (wasOpen) {
				reveal();
			} else {
				closeOverflowPopover(trigger, reveal);
			}
		}

		document.body.classList.add('mobilemenu-harvesting');
		observer.observe(document.body, { childList: true, subtree: true });
		safetyTimer = setTimeout(function () {
			finish([]);
		}, 800);

		if (wasOpen) {
			var existingLinks = qsa('.app-menu__overflow-entry > a');
			if (existingLinks.length) {
				finish(existingLinks);
			}
			// Sinon : le popover est ouvert mais son contenu n'est pas encore
			// monté — on laisse l'observer (ou le filet de sécurité) le détecter.
		} else {
			trigger.click();
		}
	}

	function populateDrawer(done) {
		if (!drawer) {
			if (done) {
				done();
			}
			return;
		}

		harvestOverflowLinks(function (overflowLinks) {
			drawer.innerHTML = '';

			var appsSection = overflowLinks.length
				? buildSectionFromItems(overflowLinks)
				: buildSection('#appmenu', 'li > a');

			if (appsSection) {
				drawer.appendChild(appsSection);
			} else {
				var empty = document.createElement('p');
				empty.className = 'mobilemenu-empty';
				empty.textContent = t('Aucun élément de menu disponible');
				drawer.appendChild(empty);
			}

			if (done) {
				done();
			}
		});
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
		populateDrawer(function () {
			document.body.classList.add('mobilemenu-open');
			toggleButton.setAttribute('aria-expanded', 'true');
			drawer.setAttribute('aria-hidden', 'false');

			document.addEventListener('keydown', onKeydown);
			overlay.addEventListener('click', closeDrawer);

			var firstLink = qs('a, button', drawer);
			if (firstLink) {
				firstLink.focus();
			}
		});
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
