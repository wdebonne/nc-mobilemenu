<?php

declare(strict_types=1);

namespace OCA\MenuCustom\Service;

use OCA\MenuCustom\AppInfo\Application;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\INavigationManager;
use OCP\IURLGenerator;
use OCP\IUser;

/**
 * Lit, valide et applique la configuration du menu (ordre des entrées,
 * masquage global, vues par groupes, portée mobile/desktop, liens
 * personnalisés) enregistrée par l'admin.
 *
 * Une « vue » est un jeu d'entrées masquées associé à un ou plusieurs groupes :
 * « Personnel cantine » et « Personnel scolaire » peuvent partager la même vue
 * plutôt que d'être configurés deux fois à l'identique.
 *
 * Un « lien » est un raccourci vers une URL arbitraire (site interne,
 * application tierce) que l'app publie dans la navigation de Nextcloud : il se
 * comporte alors exactement comme une app, et hérite sans code supplémentaire
 * de l'ordre, du masquage global et des vues.
 *
 * La configuration est stockée sous forme d'un unique blob JSON dans la
 * table appconfig, ce qui permet de la lire/écrire de façon atomique depuis
 * l'écran de réglages.
 */
class MenuConfigService {
	private const CONFIG_KEY = 'menu_config';

	/** Masquage appliqué au seul tiroir de l'app (mobile/tablette). */
	public const SCOPE_MOBILE = 'mobile';
	/** Masquage appliqué au seul menu d'applications natif (desktop + popover). */
	public const SCOPE_DESKTOP = 'desktop';
	/** Masquage appliqué partout : tiroir mobile et menu natif. */
	public const SCOPE_ALL = 'all';

	private const SCOPES = [self::SCOPE_MOBILE, self::SCOPE_DESKTOP, self::SCOPE_ALL];
	private const DEFAULT_SCOPE = self::SCOPE_ALL;

	/** Nombre de groupes renvoyés par défaut à l'autocomplétion. */
	public const GROUP_SEARCH_LIMIT = 25;

	/** Préfixe des identifiants de vues, pour ne jamais heurter un id d'app. */
	private const VIEW_ID_PREFIX = 'view-';
	/** Idem pour les liens personnalisés. */
	private const LINK_ID_PREFIX = 'link-';

	/** Icône stockée dans l'appdata de l'app, par opposition à une URL. */
	public const ICON_UPLOAD_PREFIX = 'upload:';

	public function __construct(
		private IAppConfig $appConfig,
		private IGroupManager $groupManager,
		private INavigationManager $navigationManager,
		private IURLGenerator $urlGenerator,
	) {
	}

	/**
	 * @return array{order: string[], hidden: string[], views: list<array{id: string, name: string, groups: string[], hidden: string[]}>, scope: string, links: list<array{id: string, name: string, url: string, icon: string, newTab: bool, groups: string[]}>}
	 */
	public function getConfig(): array {
		$raw = $this->appConfig->getValueString(Application::APP_ID, self::CONFIG_KEY, '');
		$decoded = $raw !== '' ? json_decode($raw, true) : null;
		if (!is_array($decoded)) {
			$decoded = [];
		}

		return [
			'order' => $this->sanitizeStringList($decoded['order'] ?? []),
			'hidden' => $this->sanitizeStringList($decoded['hidden'] ?? []),
			'views' => $this->sanitizeViews($decoded['views'] ?? null, $decoded['groupHidden'] ?? null),
			'scope' => $this->sanitizeScope($decoded['scope'] ?? null),
			'links' => $this->sanitizeLinks($decoded['links'] ?? null),
		];
	}

	/**
	 * @param string[] $order
	 * @param string[] $hidden
	 * @param array<int, mixed> $views
	 * @param array<int, mixed> $links
	 */
	public function setConfig(array $order, array $hidden, array $views, array $links, ?string $scope = null): void {
		$payload = [
			'order' => $this->sanitizeStringList($order),
			'hidden' => $this->sanitizeStringList($hidden),
			'views' => $this->sanitizeViews($views, null),
			'scope' => $this->sanitizeScope($scope),
			'links' => $this->sanitizeLinks($links),
		];

		$json = json_encode($payload);
		$this->appConfig->setValueString(Application::APP_ID, self::CONFIG_KEY, $json === false ? '' : $json);
	}

	/**
	 * Ordre global et liste des entrées masquées pour un utilisateur donné :
	 * fusionne le masquage global avec celui de toutes les vues dont il partage
	 * au moins un groupe.
	 *
	 * `hideOnMobile` / `hideOnDesktop` traduisent la portée choisie par l'admin
	 * pour que le script front n'ait pas à réinterpréter la valeur de `scope`.
	 *
	 * @return array{order: string[], hidden: string[], scope: string, hideOnMobile: bool, hideOnDesktop: bool}
	 */
	public function getEffectiveConfigForUser(?IUser $user): array {
		$config = $this->getConfig();

		$hidden = $config['hidden'];
		if ($user !== null && $config['views'] !== []) {
			$userGroups = $this->groupManager->getUserGroupIds($user);
			foreach ($config['views'] as $view) {
				if (array_intersect($view['groups'], $userGroups) !== []) {
					$hidden = array_merge($hidden, $view['hidden']);
				}
			}
		}

		$scope = $config['scope'];

		return [
			'order' => $config['order'],
			'hidden' => array_values(array_unique($hidden)),
			'scope' => $scope,
			'hideOnMobile' => $scope === self::SCOPE_MOBILE || $scope === self::SCOPE_ALL,
			'hideOnDesktop' => $scope === self::SCOPE_DESKTOP || $scope === self::SCOPE_ALL,
		];
	}

	/**
	 * Liens personnalisés visibles par un utilisateur : `groups` est une liste
	 * blanche, une liste vide signifiant « tout le monde ».
	 *
	 * Complémentaire des vues, qui sont une liste noire : la vue masque une
	 * entrée à certains groupes, le lien la réserve à certains groupes.
	 *
	 * @return list<array{id: string, name: string, url: string, icon: string, newTab: bool, groups: string[]}>
	 */
	public function getLinksForUser(?IUser $user): array {
		$links = $this->getConfig()['links'];
		if ($links === []) {
			return [];
		}

		// Cette méthode est sur le chemin d'amorçage de chaque page : on
		// n'interroge les groupes de l'utilisateur que si un lien en dépend.
		$restricted = false;
		foreach ($links as $link) {
			if ($link['groups'] !== []) {
				$restricted = true;
				break;
			}
		}

		$userGroups = ($restricted && $user !== null) ? $this->groupManager->getUserGroupIds($user) : [];

		$visible = [];
		foreach ($links as $link) {
			if ($link['groups'] !== [] && array_intersect($link['groups'], $userGroups) === []) {
				continue;
			}
			$visible[] = $link;
		}

		return $visible;
	}

	/**
	 * URL affichable d'une icône de lien : une icône téléversée est servie par
	 * `IconController`, une URL est reprise telle quelle, et l'absence d'icône
	 * laisse le tiroir afficher sa pastille de repli.
	 */
	public function resolveIconUrl(string $icon): string {
		if ($icon === '') {
			return '';
		}

		if (str_starts_with($icon, self::ICON_UPLOAD_PREFIX)) {
			return $this->urlGenerator->linkToRoute(
				Application::APP_ID . '.icon.getIcon',
				['name' => substr($icon, strlen(self::ICON_UPLOAD_PREFIX))]
			);
		}

		return $icon;
	}

	/**
	 * Entrées de navigation de l'utilisateur courant, dans leur ordre natif.
	 *
	 * Le tiroir est construit à partir de ces données plutôt qu'en clonant le
	 * DOM du header : la structure du menu d'applications change à chaque
	 * version majeure de Nextcloud (grille d'apps de Hub 26 / NC 34), alors que
	 * `INavigationManager` reste stable.
	 *
	 * `target` est repris tel quel : les liens personnalisés de cette app, comme
	 * ceux d'apps tierces, peuvent demander une ouverture dans un nouvel onglet.
	 * `rawIcon` signale une icône couleur, que le tiroir ne doit pas inverser en
	 * thème sombre comme il le fait des SVG monochromes de Nextcloud.
	 *
	 * @param string $type `link` pour les apps, `settings` pour le menu du compte
	 * @return array<int, array{id: string, name: string, href: string, icon: string, active: bool, target: string, rawIcon: bool}>
	 */
	public function getNavigationEntries(string $type = 'link'): array {
		$entries = [];
		foreach ($this->navigationManager->getAll($type) as $entry) {
			$id = (string)($entry['id'] ?? '');
			if ($id === '') {
				continue;
			}

			$entries[] = [
				'id' => $id,
				'name' => (string)($entry['name'] ?? $id),
				'href' => (string)($entry['href'] ?? ''),
				'icon' => (string)($entry['icon'] ?? ''),
				'active' => (bool)($entry['active'] ?? false),
				'target' => (string)($entry['target'] ?? ''),
				'rawIcon' => (bool)($entry['rawIcon'] ?? false),
			];
		}

		return $entries;
	}

	/**
	 * Entrées proposées à l'admin dans l'écran de réglages : la navigation
	 * visible par l'admin, complétée par les liens personnalisés qu'il ne voit
	 * pas lui-même (réservés à d'autres groupes) puis par les identifiants
	 * encore référencés dans la configuration mais absents de sa navigation
	 * (app désactivée ou restreinte), pour ne pas perdre un réglage existant.
	 *
	 * `type` distingue une app d'un lien personnalisé, que l'écran de réglages
	 * signale par un badge.
	 *
	 * @return array<int, array{id: string, name: string, known: bool, type: string}>
	 */
	public function getMenuEntries(): array {
		$config = $this->getConfig();

		$linkIds = [];
		foreach ($config['links'] as $link) {
			$linkIds[$link['id']] = true;
		}

		$entries = [];
		$seen = [];

		foreach ($this->getNavigationEntries('link') as $entry) {
			$entries[] = [
				'id' => $entry['id'],
				'name' => $entry['name'],
				'known' => true,
				'type' => isset($linkIds[$entry['id']]) ? 'link' : 'app',
			];
			$seen[$entry['id']] = true;
		}

		// Lien réservé à des groupes dont l'admin ne fait pas partie : absent de
		// sa navigation, mais il doit tout de même pouvoir le ranger et le
		// masquer, donc on ne le laisse pas tomber dans le repli ci-dessous.
		foreach ($config['links'] as $link) {
			if (isset($seen[$link['id']])) {
				continue;
			}

			$entries[] = [
				'id' => $link['id'],
				'name' => $link['name'],
				'known' => true,
				'type' => 'link',
			];
			$seen[$link['id']] = true;
		}

		$referenced = array_merge($config['order'], $config['hidden']);
		foreach ($config['views'] as $view) {
			$referenced = array_merge($referenced, $view['hidden']);
		}

		foreach (array_unique($referenced) as $id) {
			if (isset($seen[$id])) {
				continue;
			}

			$entries[] = [
				'id' => $id,
				'name' => $id,
				'known' => false,
				'type' => 'app',
			];
			$seen[$id] = true;
		}

		return $entries;
	}

	/**
	 * Recherche de groupes pour l'autocomplétion de l'écran de réglages.
	 *
	 * On délègue la recherche à `IGroupManager` plutôt que d'envoyer toute la
	 * liste des groupes au navigateur : une instance peut en compter des
	 * milliers.
	 *
	 * @return array<int, array{id: string, name: string}>
	 */
	public function searchGroups(string $search = '', int $limit = self::GROUP_SEARCH_LIMIT, int $offset = 0): array {
		$limit = max(1, min($limit, 100));
		$offset = max(0, $offset);

		$groups = [];
		foreach ($this->groupManager->search($search, $limit, $offset) as $group) {
			$groups[] = [
				'id' => $group->getGID(),
				'name' => $group->getDisplayName(),
			];
		}

		return $groups;
	}

	/**
	 * Libellés des groupes déjà référencés par une vue ou un lien, pour les
	 * afficher sans dépendre d'une recherche. Un groupe supprimé entre-temps est
	 * renvoyé avec son identifiant comme libellé et `known` à false.
	 *
	 * @param string[] $ids
	 * @return array<int, array{id: string, name: string, known: bool}>
	 */
	public function getGroupsByIds(array $ids): array {
		$groups = [];
		foreach (array_unique($this->sanitizeStringList($ids)) as $id) {
			$group = $this->groupManager->get($id);
			$groups[] = [
				'id' => $id,
				'name' => $group !== null ? $group->getDisplayName() : $id,
				'known' => $group !== null,
			];
		}

		return $groups;
	}

	/**
	 * Réécrit la configuration stockée au format courant (conversion de
	 * `groupHidden` en vues) et remplace le nom de repli des vues converties
	 * par le libellé réel du groupe. Appelé par l'étape de réparation : la
	 * lecture, elle, doit rester sans accès à la base.
	 */
	public function normaliseStoredConfig(): bool {
		$raw = $this->appConfig->getValueString(Application::APP_ID, self::CONFIG_KEY, '');
		if ($raw === '') {
			return false;
		}

		$config = $this->getConfig();
		$views = [];
		foreach ($config['views'] as $view) {
			// Vue issue de l'ancien format : elle porte l'identifiant du groupe
			// en guise de nom, on lui donne son libellé lisible.
			if (count($view['groups']) === 1 && $view['name'] === $view['groups'][0]) {
				$group = $this->groupManager->get($view['groups'][0]);
				if ($group !== null) {
					$view['name'] = $group->getDisplayName();
				}
			}
			$views[] = $view;
		}

		$this->setConfig($config['order'], $config['hidden'], $views, $config['links'], $config['scope']);

		return true;
	}

	/**
	 * @param mixed $value
	 * @return string[]
	 */
	private function sanitizeStringList($value): array {
		if (!is_array($value)) {
			return [];
		}

		$list = [];
		foreach ($value as $item) {
			if (is_string($item) && $item !== '') {
				$list[] = $item;
			}
		}

		return array_values(array_unique($list));
	}

	/**
	 * Valide les vues, et convertit l'ancien format `groupHidden`
	 * (un jeu d'entrées masquées par groupe) en vues à un seul groupe.
	 *
	 * La conversion se fait sans accès à la base — cette méthode est sur le
	 * chemin de rendu de chaque page — d'où le nom de repli égal à
	 * l'identifiant du groupe ; `normaliseStoredConfig()` le corrige ensuite.
	 *
	 * @param mixed $value
	 * @param mixed $legacyGroupHidden
	 * @return list<array{id: string, name: string, groups: string[], hidden: string[]}>
	 */
	private function sanitizeViews($value, $legacyGroupHidden): array {
		$views = [];
		$usedIds = [];

		if (is_array($value)) {
			foreach ($value as $view) {
				if (!is_array($view)) {
					continue;
				}

				$id = $this->sanitizeEntryId($view['id'] ?? null, $usedIds, self::VIEW_ID_PREFIX);
				$usedIds[$id] = true;

				$views[] = [
					'id' => $id,
					'name' => is_string($view['name'] ?? null) ? trim($view['name']) : '',
					'groups' => $this->sanitizeStringList($view['groups'] ?? []),
					'hidden' => $this->sanitizeStringList($view['hidden'] ?? []),
				];
			}
		}

		if ($views !== [] || !is_array($legacyGroupHidden)) {
			return $views;
		}

		foreach ($legacyGroupHidden as $groupId => $hidden) {
			if (!is_string($groupId) || $groupId === '') {
				continue;
			}

			$hidden = $this->sanitizeStringList($hidden);
			if ($hidden === []) {
				continue;
			}

			$id = $this->sanitizeEntryId(null, $usedIds, self::VIEW_ID_PREFIX);
			$usedIds[$id] = true;

			$views[] = [
				'id' => $id,
				'name' => $groupId,
				'groups' => [$groupId],
				'hidden' => $hidden,
			];
		}

		return $views;
	}

	/**
	 * Valide les liens personnalisés. Un lien sans nom ou sans URL exploitable
	 * est écarté : il serait publié dans la navigation de tous les utilisateurs,
	 * mieux vaut ne rien afficher qu'une entrée cassée.
	 *
	 * @param mixed $value
	 * @return list<array{id: string, name: string, url: string, icon: string, newTab: bool, groups: string[]}>
	 */
	private function sanitizeLinks($value): array {
		if (!is_array($value)) {
			return [];
		}

		$links = [];
		$usedIds = [];

		foreach ($value as $link) {
			if (!is_array($link)) {
				continue;
			}

			$name = is_string($link['name'] ?? null) ? trim($link['name']) : '';
			$url = $this->sanitizeUrl($link['url'] ?? null);
			if ($name === '' || $url === '') {
				continue;
			}

			$id = $this->sanitizeEntryId($link['id'] ?? null, $usedIds, self::LINK_ID_PREFIX);
			$usedIds[$id] = true;

			$links[] = [
				'id' => $id,
				'name' => $name,
				'url' => $url,
				'icon' => $this->sanitizeIcon($link['icon'] ?? null),
				'newTab' => (bool)($link['newTab'] ?? false),
				'groups' => $this->sanitizeStringList($link['groups'] ?? []),
			];
		}

		return $links;
	}

	/**
	 * URL de destination d'un lien : `http`/`https`, ou chemin absolu pour
	 * pointer vers une page interne de l'instance. Tout le reste — et
	 * notamment `javascript:` — est rejeté.
	 *
	 * @param mixed $value
	 */
	private function sanitizeUrl($value): string {
		if (!is_string($value)) {
			return '';
		}

		$url = trim($value);
		if ($url === '') {
			return '';
		}

		// Chemin interne (`/apps/...`) ; `//` serait une URL protocol-relative,
		// donc externe, et doit passer par la validation complète.
		if (str_starts_with($url, '/') && !str_starts_with($url, '//')) {
			return $url;
		}

		if (filter_var($url, FILTER_VALIDATE_URL) === false) {
			return '';
		}

		$scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));

		return in_array($scheme, ['http', 'https'], true) ? $url : '';
	}

	/**
	 * Icône d'un lien : référence vers un fichier téléversé, ou URL/chemin
	 * d'image. La valeur vide est légitime, le tiroir affiche alors une pastille
	 * portant l'initiale du nom.
	 *
	 * @param mixed $value
	 */
	private function sanitizeIcon($value): string {
		if (!is_string($value)) {
			return '';
		}

		$icon = trim($value);
		if ($icon === '') {
			return '';
		}

		if (str_starts_with($icon, self::ICON_UPLOAD_PREFIX)) {
			$name = substr($icon, strlen(self::ICON_UPLOAD_PREFIX));

			return IconService::isValidName($name) ? self::ICON_UPLOAD_PREFIX . $name : '';
		}

		return $this->sanitizeUrl($icon);
	}

	/**
	 * Identifiant d'une vue ou d'un lien. Le jeu de caractères est volontairement
	 * étroit : ces identifiants sont interpolés dans des sélecteurs CSS par le
	 * script front pour masquer les entrées du menu natif.
	 *
	 * @param mixed $value
	 * @param array<string, bool> $usedIds
	 */
	private function sanitizeEntryId($value, array $usedIds, string $prefix): string {
		if (is_string($value) && preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $value) === 1 && !isset($usedIds[$value])) {
			return $value;
		}

		do {
			$id = $prefix . bin2hex(random_bytes(6));
		} while (isset($usedIds[$id]));

		return $id;
	}

	/**
	 * @param mixed $value
	 */
	private function sanitizeScope($value): string {
		if (is_string($value) && in_array($value, self::SCOPES, true)) {
			return $value;
		}

		return self::DEFAULT_SCOPE;
	}
}
