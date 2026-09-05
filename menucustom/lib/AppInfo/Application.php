<?php

declare(strict_types=1);

namespace OCA\MenuCustom\AppInfo;

use OCA\MenuCustom\Listener\BeforeTemplateRenderedListener;
use OCA\MenuCustom\Service\MenuConfigService;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\INavigationManager;
use OCP\IUserSession;

class Application extends App implements IBootstrap {
	public const APP_ID = 'menucustom';

	/**
	 * Rang de départ des liens personnalisés dans le menu natif : après les apps
	 * de base de Nextcloud. L'ordre défini par l'admin s'applique ensuite
	 * par-dessus, côté script.
	 */
	private const LINK_NAVIGATION_ORDER = 90;

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
		$context->registerEventListener(BeforeTemplateRenderedEvent::class, BeforeTemplateRenderedListener::class);
	}

	public function boot(IBootContext $context): void {
		$this->registerCustomLinks($context);
	}

	/**
	 * Publie les liens personnalisés dans la navigation de Nextcloud.
	 *
	 * Les déclarer ici plutôt que de les injecter directement dans le tiroir
	 * leur fait suivre le même chemin qu'une app : ils apparaissent dans le menu
	 * natif comme dans le tiroir, et héritent sans code supplémentaire de
	 * l'ordre, du masquage global et des vues par groupes.
	 */
	private function registerCustomLinks(IBootContext $context): void {
		try {
			$server = $context->getServerContainer();

			/** @var IUserSession $userSession */
			$userSession = $server->get(IUserSession::class);
			$user = $userSession->getUser();
			if ($user === null) {
				return;
			}

			/** @var MenuConfigService $menuConfigService */
			$menuConfigService = $server->get(MenuConfigService::class);
			$links = $menuConfigService->getLinksForUser($user);
			if ($links === []) {
				return;
			}

			/** @var INavigationManager $navigationManager */
			$navigationManager = $server->get(INavigationManager::class);

			foreach (array_values($links) as $index => $link) {
				$entry = [
					'id' => $link['id'],
					'name' => $link['name'],
					'href' => $link['url'],
					'icon' => $menuConfigService->resolveIconUrl($link['icon']),
					'order' => self::LINK_NAVIGATION_ORDER + $index,
					'target' => $link['newTab'] ? '_blank' : '_self',
					// Icône fournie par l'admin : contrairement aux SVG
					// monochromes de Nextcloud, elle ne doit pas être inversée
					// en thème sombre.
					'rawIcon' => true,
				];

				$navigationManager->add(static fn () => $entry);
			}
		} catch (\Throwable $e) {
			// Un amorçage qui échoue (base indisponible, configuration
			// corrompue) ne doit jamais empêcher le rendu des pages.
		}
	}
}
