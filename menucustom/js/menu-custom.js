/**
 * Menu Custom — ajoute un bouton hamburger et un tiroir de navigation
 * coulissant à la barre du haut de Nextcloud sur mobile et tablette, et
 * applique les règles de masquage/ordre définies par l'admin.
 *
 * Deux principes :
 *
 * 1. Le tiroir est construit à partir des entrées de navigation fournies par
 *    le serveur (`INavigationManager`), et non en clonant le header. La
 *    structure du menu d'applications change à chaque version majeure de
 *    Nextcloud (grille d'apps de Hub 26 / NC 34) ; les données de navigation,
 *    elles, sont stables. Le clonage du DOM reste en secours si l'état initial
 *    n'est pas disponible.
 * 2. Le masquage du menu natif (desktop, tablette, mobile) n'enlève jamais un
 *    nœud du DOM de Nextcloud : on ajoute seulement une classe CSS et on la
 *    réapplique si Vue re-rend le header ou ouvre la grille d'applications.
 */
(function () {
	'use strict';

	var APP_ID = 'menucustom';
	var BREAKPOINT = '(max-width: 1024px)';
	var NATIVE_HIDDEN_CLASS = 'menucustom-native-hidden';
	var NATIVE_STYLE_ID = 'menucustom-native-rules';

	/**
	 * Nombre minimal d'entrées d'application qu'un conteneur doit contenir pour
	 * être considéré comme un menu d'applications. Évite de masquer un simple
	 * lien vers /apps/deck posé ailleurs dans l'interface.
	 */
	var MIN_ENTRIES_FOR_MENU = 3;

	/** Identifiants d'app sûrs à interpoler dans un sélecteur CSS. */
	var SAFE_APP_ID = /^[A-Za-z0-9_.-]+$/;

	var mediaQuery = window.matchMedia(BREAKPOINT);

	var toggleButton = null;
	var overlay = null;
	var drawer = null;
	var initialized = false;

	var state;
	var nativeObserver = null;
	var nativeScanScheduled = false;

	function qs(selector, context) {
		return (context || document).querySelector(selector);
	}

	function qsa(selector, context) {
		return Array.prototype.slice.call((context || document).querySelectorAll(selector));
	}

	/**
	 * Traduction minimale sans dépendance : Nextcloud expose `t()` globalement
	 * pour les scripts chargés via addScript ; on reste défensif si absent.
	 */
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

	/**
	 * Configuration effective de l'utilisateur courant (ordre, entrées
	 * masquées, portée) et entrées de navigation, mises en cache : elles sont
	 * relues à chaque ouverture du tiroir et à chaque scan du menu natif.
	 */
	function getState() {
		if (state !== undefined) {
			return state;
		}

		var config = loadState('menuConfig', null) || {};
		var navigation = loadState('navigation', []) || [];
		var settingsNavigation = loadState('settingsNavigation', []) || [];

		var hidden = config.hidden || [];
		// Objets sans prototype : un identifiant d'app comme `constructor` ou
		// `toString` ne doit pas paraître « connu » par héritage.
		var hiddenSet = Object.create(null);
		hidden.forEach(function (id) {
			hiddenSet[id] = true;
		});

		// Identifiants reconnus comme des entrées de menu : ceux de la
		// navigation de l'utilisateur, plus ceux qu'il faut masquer (une app
		// masquée reste présente dans le menu natif tant qu'on ne l'a pas
		// cachée, donc elle doit rester identifiable).
		var knownIds = Object.create(null);
		navigation.forEach(function (entry) {
			knownIds[entry.id] = true;
		});
		hidden.forEach(function (id) {
			knownIds[id] = true;
		});

		state = {
			order: config.order || [],
			hidden: hidden,
			hiddenSet: hiddenSet,
			knownIds: knownIds,
			// Valeurs par défaut permissives si l'état initial est absent :
			// mieux vaut un menu complet qu'un menu vide.
			hideOnMobile: config.hideOnMobile !== false,
			hideOnDesktop: config.hideOnDesktop === true,
			// Ici le défaut permissif serait à contresens : la section « Compte »
			// double le menu de l'avatar, l'admin doit la demander.
			showAccount: config.showAccount === true,
			navigation: navigation,
			settingsNavigation: settingsNavigation
		};

		return state;
	}

	/**
	 * Trie selon l'ordre configuré ; les entrées non listées gardent leur ordre
	 * d'origine et sont placées après celles explicitement ordonnées.
	 *
	 * @param {Array} list éléments à trier
	 * @param {string[]} order identifiants d'app dans l'ordre voulu
	 * @param {function} idOf extrait l'identifiant d'app d'un élément
	 */
	function sortByOrder(list, order, idOf) {
		if (!order.length) {
			return list;
		}

		var orderIndex = {};
		order.forEach(function (appId, index) {
			orderIndex[appId] = index;
		});

		return list
			.map(function (item, naturalIndex) {
				var appId = idOf(item);
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

	/* ------------------------------------------------------------------ *
	 * Identification des entrées du menu natif
	 * ------------------------------------------------------------------ */

	/**
	 * Identifie l'app à laquelle correspond un élément de menu, en essayant
	 * plusieurs attributs/heuristiques pour rester robuste face aux variations
	 * de balisage entre versions et thèmes de Nextcloud.
	 */
	function getEntryAppId(item) {
		// L'identifiant peut se trouver sur l'élément lui-même (lien/bouton)
		// ou sur un ancêtre proche (<li>, conteneur d'entrée), selon la
		// structure du menu.
		var candidates = [item];
		if (item.closest) {
			['li', '[data-app-id]', '[data-id]'].forEach(function (selector) {
				var ancestor = item.closest(selector);
				if (ancestor && candidates.indexOf(ancestor) === -1) {
					candidates.push(ancestor);
				}
			});
		}

		for (var i = 0; i < candidates.length; i++) {
			var el = candidates[i];
			if (!el.dataset) {
				continue;
			}
			if (el.dataset.appId) {
				return el.dataset.appId;
			}
			if (el.dataset.id) {
				return el.dataset.id;
			}
		}

		var link = (item.matches && item.matches('a, button')) ? item : qs('a, button', item);
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
	 * Racines à inspecter pour trouver le menu d'applications natif : le header
	 * et les popovers/dialogues, que Vue téléporte à la racine du body (menu
	 * « plus », grille d'applications de Nextcloud 34).
	 */
	function collectNativeRoots() {
		var roots = [];
		var header = document.getElementById('header');
		if (header) {
			roots.push(header);
		}

		qsa('.v-popper__popper, .app-menu-popover, .popover, [role="dialog"], [role="menu"]', document.body)
			.forEach(function (el) {
				if (header && header.contains(el)) {
					return;
				}
				// Évite de scanner deux fois un popover imbriqué dans un autre.
				for (var i = 0; i < roots.length; i++) {
					if (roots[i].contains(el)) {
						return;
					}
				}
				roots.push(el);
			});

		return roots;
	}

	/**
	 * Combien d'éléments de `elements` `parent` contient-il ? On s'arrête à 2 :
	 * seul « exactement un » nous intéresse.
	 */
	function containsAtMostOne(parent, elements) {
		var count = 0;
		for (var i = 0; i < elements.length; i++) {
			if (parent.contains(elements[i]) && ++count > 1) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Sépare l'entrée de son conteneur sans dépendre d'une classe CSS : on
	 * remonte tant que l'ancêtre ne représente que cette seule entrée. Le
	 * dernier ancêtre « mono-entrée » est l'élément à masquer (le <li>, la
	 * tuile de la grille…), et son parent est le menu qui la contient.
	 *
	 * S'appuyer sur les classes (`.app-menu-entry`, `.app-grid-entry`…) serait
	 * fragile : elles changent à chaque refonte du header.
	 */
	function resolveEntry(el, elements, root) {
		var node = el;
		var parent = node.parentElement;

		while (parent && node !== root && containsAtMostOne(parent, elements)) {
			node = parent;
			parent = node.parentElement;
		}

		if (!parent || parent === document.body || parent === document.documentElement) {
			return null;
		}

		return { root: node, container: parent };
	}

	/**
	 * Repère les menus d'applications natifs et y applique les règles de
	 * l'admin : masquage des entrées, et ordre personnalisé quand le conteneur
	 * est une liste flex/grille (cas des menus et grilles de Nextcloud).
	 */
	function scanNativeMenus() {
		var st = getState();
		if (!st.hideOnDesktop) {
			return;
		}

		var containers = [];
		var entriesByContainer = [];

		collectNativeRoots().forEach(function (root) {
			var found = [];
			qsa('a[href], button', root).forEach(function (el) {
				var appId = getEntryAppId(el);
				if (appId && st.knownIds[appId]) {
					found.push({ el: el, appId: appId });
				}
			});

			if (found.length < MIN_ENTRIES_FOR_MENU) {
				return;
			}

			var elements = found.map(function (item) {
				return item.el;
			});

			found.forEach(function (item) {
				var resolved = resolveEntry(item.el, elements, root);
				if (!resolved) {
					return;
				}

				var index = containers.indexOf(resolved.container);
				if (index === -1) {
					containers.push(resolved.container);
					entriesByContainer.push([]);
					index = containers.length - 1;
				}
				entriesByContainer[index].push({ root: resolved.root, appId: item.appId });
			});
		});

		containers.forEach(function (container, index) {
			var items = entriesByContainer[index];
			if (items.length < MIN_ENTRIES_FOR_MENU) {
				// Pas un menu d'applications : on n'y touche pas.
				return;
			}

			var roots = [];
			items.forEach(function (item) {
				if (roots.indexOf(item.root) !== -1) {
					return;
				}
				roots.push(item.root);

				if (st.hiddenSet[item.appId]) {
					item.root.classList.add(NATIVE_HIDDEN_CLASS);
				} else if (item.root.classList.contains(NATIVE_HIDDEN_CLASS)) {
					item.root.classList.remove(NATIVE_HIDDEN_CLASS);
				}
			});

			if (!st.order.length) {
				return;
			}

			// `order` n'a d'effet que dans un conteneur flex ou grille : sans
			// effet ailleurs, donc sans risque.
			var ordered = sortByOrder(roots.slice(), st.order, function (root) {
				return getEntryAppId(root);
			});
			ordered.forEach(function (root, position) {
				root.style.order = String(position);
			});
		});
	}

	/**
	 * Les mutations sont nombreuses sur une page Nextcloud (listes de fichiers,
	 * notifications…) : on ne relance un scan que si le DOM vient de recevoir
	 * quelque chose qui ressemble à une entrée d'application.
	 */
	function mutationsAddedMenuEntries(mutations) {
		for (var i = 0; i < mutations.length; i++) {
			var added = mutations[i].addedNodes;
			for (var j = 0; j < added.length; j++) {
				var node = added[j];
				if (node.nodeType !== 1) {
					continue;
				}
				if ((node.matches && node.matches('a[href*="/apps/"], [data-app-id]'))
					|| (node.querySelector && node.querySelector('a[href*="/apps/"], [data-app-id]'))) {
					return true;
				}
			}
		}
		return false;
	}

	function onNativeMutation(mutations) {
		if (mutationsAddedMenuEntries(mutations)) {
			scheduleNativeScan();
		}
	}

	function scheduleNativeScan() {
		if (nativeScanScheduled) {
			return;
		}
		nativeScanScheduled = true;

		var run = function () {
			nativeScanScheduled = false;
			scanNativeMenus();
		};

		if (typeof window.requestAnimationFrame === 'function') {
			window.requestAnimationFrame(run);
		} else {
			setTimeout(run, 50);
		}
	}

	/**
	 * Règles CSS statiques posées dès le chargement, avant tout scan : elles
	 * couvrent le balisage documenté de Nextcloud (`data-app-id`) et évitent
	 * qu'une entrée masquée apparaisse une fraction de seconde.
	 */
	function injectNativeStyles() {
		var st = getState();
		if (!st.hideOnDesktop || !st.hidden.length) {
			return;
		}

		var scopes = ['#header', '.app-menu-popover', '[class*="app-menu"]', '[class*="app-grid"]'];
		var selectors = [];

		st.hidden.forEach(function (appId) {
			if (!SAFE_APP_ID.test(appId)) {
				return;
			}
			scopes.forEach(function (scope) {
				selectors.push(scope + ' [data-app-id="' + appId + '"]');
			});
		});

		if (!selectors.length) {
			return;
		}

		var style = document.getElementById(NATIVE_STYLE_ID);
		if (!style) {
			style = document.createElement('style');
			style.id = NATIVE_STYLE_ID;
			(document.head || document.documentElement).appendChild(style);
		}
		style.textContent = selectors.join(',\n') + ' { display: none !important; }';
	}

	function applyNativeRules() {
		var st = getState();
		if (!st.hideOnDesktop) {
			return;
		}

		injectNativeStyles();
		scanNativeMenus();

		if (nativeObserver || typeof MutationObserver === 'undefined') {
			return;
		}

		// La grille d'applications et les menus déroulants sont montés à la
		// demande par Vue : on réapplique les règles à chaque ajout de nœud.
		nativeObserver = new MutationObserver(onNativeMutation);
		nativeObserver.observe(document.body, { childList: true, subtree: true });
	}

	/* ------------------------------------------------------------------ *
	 * Tiroir de navigation
	 * ------------------------------------------------------------------ */

	/**
	 * Entrées d'applications à afficher dans le tiroir : masquages appliqués
	 * (si la portée les concerne), puis ordre personnalisé.
	 */
	function drawerEntries() {
		var st = getState();

		var visible = st.hideOnMobile
			? st.navigation.filter(function (entry) {
				return !st.hiddenSet[entry.id];
			})
			: st.navigation.slice();

		return sortByOrder(visible, st.order, function (entry) {
			return entry.id;
		});
	}

	function buildEntryLink(entry) {
		var link = document.createElement('a');
		link.className = 'menucustom-entry';
		link.href = entry.href || '#';
		if (entry.active) {
			link.classList.add('menucustom-entry--active');
			link.setAttribute('aria-current', 'page');
		}

		// Demandé par les liens personnalisés de l'app, et par les entrées
		// d'apps tierces qui pointent vers un site externe.
		if (entry.target === '_blank') {
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
		}

		if (entry.icon) {
			var icon = document.createElement('img');
			// Les icônes d'app de Nextcloud sont des SVG noirs, inversés en
			// thème sombre par la feuille de style ; une icône fournie par
			// l'admin est déjà en couleur et doit rester telle quelle.
			icon.className = entry.rawIcon
				? 'menucustom-entry-icon menucustom-entry-icon--raw'
				: 'menucustom-entry-icon';
			icon.src = entry.icon;
			icon.alt = '';
			icon.setAttribute('aria-hidden', 'true');
			link.appendChild(icon);
		} else {
			var placeholder = document.createElement('span');
			placeholder.className = 'menucustom-entry-icon menucustom-entry-icon--placeholder';
			placeholder.setAttribute('aria-hidden', 'true');
			placeholder.textContent = (entry.name || entry.id || '?').charAt(0).toUpperCase();
			link.appendChild(placeholder);
		}

		var label = document.createElement('span');
		label.className = 'menucustom-entry-label';
		label.textContent = entry.name || entry.id;
		link.appendChild(label);

		return link;
	}

	function buildSection(title, children) {
		if (!children.length) {
			return null;
		}

		var section = document.createElement('section');
		section.className = 'menucustom-section';

		var heading = document.createElement('h2');
		heading.textContent = title;
		section.appendChild(heading);

		var list = document.createElement('ul');
		children.forEach(function (child) {
			var li = document.createElement('li');
			li.appendChild(child);
			list.appendChild(li);
		});

		section.appendChild(list);
		return section;
	}

	function buildDataSection(title, entries) {
		return buildSection(title, entries.map(buildEntryLink));
	}

	/**
	 * Secours si l'état initial du serveur est indisponible : on clone les
	 * liens présents dans le DOM, sans jamais déplacer ni modifier l'original.
	 */
	function buildClonedSection(title, sourceSelector, itemSelector) {
		var source = qs(sourceSelector);
		if (!source) {
			return null;
		}

		var clones = qsa(itemSelector, source).map(function (item) {
			var clone = item.cloneNode(true);
			clone.removeAttribute('id');
			qsa('[id]', clone).forEach(function (el) {
				el.removeAttribute('id');
			});
			qsa('.action-link__icon--url, .app-icon', clone).forEach(recolorClonedIcon);
			return clone;
		});

		return buildSection(title, clones);
	}

	/**
	 * Les icônes du header sont blanches : prévues pour le fond fixe de la
	 * barre du haut, elles sont quasi invisibles sur celui du tiroir, et le
	 * problème s'inverse en thème sombre. Les convertir en masque teinté avec
	 * `--color-main-text` les rend lisibles dans les deux thèmes sans avoir à
	 * détecter lequel est actif.
	 *
	 * Ne concerne que les entrées clonées : celles construites à partir des
	 * données du serveur portent leur propre icône.
	 */
	function recolorClonedIcon(icon) {
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

	/**
	 * Barre de titre du tiroir. Le voile et la touche Échap ferment déjà le
	 * tiroir, mais ni l'un ni l'autre ne se devine : sur un écran tactile, il
	 * faut une croix visible.
	 */
	function buildDrawerHeader() {
		var header = document.createElement('div');
		header.className = 'menucustom-drawer-header';

		var title = document.createElement('span');
		title.className = 'menucustom-drawer-title';
		title.textContent = t('Menu');

		var close = document.createElement('button');
		close.type = 'button';
		close.className = 'menucustom-drawer-close';
		close.setAttribute('aria-label', t('Fermer le menu'));
		close.textContent = '×';
		close.addEventListener('click', closeDrawer);

		header.appendChild(title);
		header.appendChild(close);

		return header;
	}

	function populateDrawer() {
		if (!drawer) {
			return;
		}

		drawer.innerHTML = '';
		drawer.appendChild(buildDrawerHeader());

		var st = getState();
		var sections = [];

		var apps = drawerEntries();
		sections.push(apps.length
			? buildDataSection(t('Applications'), apps)
			: buildClonedSection(t('Applications'), '#header', '#appmenu li > a, .app-menu-entry a'));

		if (st.showAccount) {
			sections.push(st.settingsNavigation.length
				? buildDataSection(t('Compte'), st.settingsNavigation)
				: buildClonedSection(t('Compte'), '#user-menu, #settings', 'a, button'));
		}

		var hasContent = false;
		sections.forEach(function (section) {
			if (section) {
				drawer.appendChild(section);
				hasContent = true;
			}
		});

		if (!hasContent) {
			var empty = document.createElement('p');
			empty.className = 'menucustom-empty';
			empty.textContent = t('Aucun élément de menu disponible');
			drawer.appendChild(empty);
		}
	}

	function openDrawer() {
		populateDrawer();
		document.body.classList.add('menucustom-open');
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
		if (!document.body.classList.contains('menucustom-open')) {
			return;
		}

		document.body.classList.remove('menucustom-open');
		toggleButton.setAttribute('aria-expanded', 'false');
		drawer.setAttribute('aria-hidden', 'true');

		document.removeEventListener('keydown', onKeydown);
		overlay.removeEventListener('click', closeDrawer);

		toggleButton.focus();
	}

	function isOpen() {
		return document.body.classList.contains('menucustom-open');
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
		toggleButton.className = 'menucustom-toggle';
		toggleButton.setAttribute('aria-label', t('Ouvrir le menu de navigation'));
		toggleButton.setAttribute('aria-expanded', 'false');
		toggleButton.setAttribute('aria-controls', 'menucustom-drawer');
		for (var i = 0; i < 3; i++) {
			var bar = document.createElement('span');
			bar.className = 'menucustom-bar';
			bar.setAttribute('aria-hidden', 'true');
			toggleButton.appendChild(bar);
		}
		toggleButton.addEventListener('click', onToggleClick);

		overlay = document.createElement('div');
		overlay.className = 'menucustom-overlay';
		overlay.setAttribute('aria-hidden', 'true');

		drawer = document.createElement('nav');
		drawer.id = 'menucustom-drawer';
		drawer.className = 'menucustom-drawer';
		drawer.setAttribute('role', 'dialog');
		drawer.setAttribute('aria-label', t('Menu de navigation'));
		drawer.setAttribute('aria-hidden', 'true');
		drawer.addEventListener('click', onDrawerClick);

		// Le header de Nextcloud 34 est une barre flex : insérer le bouton en
		// premier enfant le place à gauche du logo, comme un hamburger classique.
		header.insertBefore(toggleButton, header.firstChild);
		document.body.appendChild(overlay);
		document.body.appendChild(drawer);

		mediaQuery.addEventListener('change', onMediaChange);
	}

	function init() {
		if (initialized) {
			return;
		}
		initialized = true;

		applyNativeRules();

		var header = qs('#header');
		if (!header) {
			return;
		}

		buildUI(header);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
