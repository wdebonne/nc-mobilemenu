<?php

declare(strict_types=1);

namespace OCA\MenuCustom\Controller;

use OCA\MenuCustom\AppInfo\Application;
use OCA\MenuCustom\Service\IconService;
use OCA\MenuCustom\Service\MenuConfigService;
use OCA\MenuCustom\Settings\Admin;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\AuthorizedAdminSetting;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class SettingsController extends Controller {
	public function __construct(
		IRequest $request,
		private MenuConfigService $menuConfigService,
		private IconService $iconService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * Enregistre l'ordre du menu, les entrées masquées globalement, les vues
	 * par groupes, les liens personnalisés et la portée du masquage (mobile,
	 * desktop ou les deux), depuis l'écran de réglages admin.
	 *
	 * @param string[] $order
	 * @param string[] $hidden
	 * @param array<int, mixed> $views
	 * @param array<int, mixed> $links
	 */
	#[AuthorizedAdminSetting(settings: Admin::class)]
	public function save(array $order, array $hidden, array $views, array $links = [], ?string $scope = null): DataResponse {
		$this->menuConfigService->setConfig($order, $hidden, $views, $links, $scope);

		$config = $this->menuConfigService->getConfig();
		$this->purgeUnusedIcons($config['links']);

		return new DataResponse($config);
	}

	/**
	 * Autocomplétion de groupes pour l'association d'une vue ou d'un lien. La
	 * recherche est faite côté serveur : une instance peut compter des milliers
	 * de groupes, qu'il serait déraisonnable d'envoyer entièrement au navigateur.
	 */
	#[AuthorizedAdminSetting(settings: Admin::class)]
	public function searchGroups(string $search = '', int $limit = MenuConfigService::GROUP_SEARCH_LIMIT): DataResponse {
		return new DataResponse($this->menuConfigService->searchGroups($search, $limit));
	}

	/**
	 * Retire de l'appdata les icônes qu'aucun lien n'utilise plus (lien supprimé
	 * ou icône remplacée). Sans conséquence sur l'enregistrement lui-même.
	 *
	 * @param list<array{icon: string}> $links
	 */
	private function purgeUnusedIcons(array $links): void {
		$kept = [];
		foreach ($links as $link) {
			if (str_starts_with($link['icon'], MenuConfigService::ICON_UPLOAD_PREFIX)) {
				$kept[] = substr($link['icon'], strlen(MenuConfigService::ICON_UPLOAD_PREFIX));
			}
		}

		try {
			$this->iconService->purge($kept);
		} catch (\Throwable $e) {
			// Le ménage est opportuniste : il ne doit pas faire échouer la
			// sauvegarde des réglages.
		}
	}
}
