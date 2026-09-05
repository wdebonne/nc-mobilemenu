<?php

declare(strict_types=1);

namespace OCA\MenuCustom\Listener;

use OCA\MenuCustom\AppInfo\Application;
use OCA\MenuCustom\Service\MenuConfigService;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IUserSession;
use OCP\Util;

/**
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class BeforeTemplateRenderedListener implements IEventListener {
	public function __construct(
		private IInitialState $initialState,
		private MenuConfigService $menuConfigService,
		private IUserSession $userSession,
	) {
	}

	public function handle(Event $event): void {
		if (!($event instanceof BeforeTemplateRenderedEvent)) {
			return;
		}

		// Pages publiques / écran de connexion : aucun menu d'applications à
		// adapter, inutile d'y charger le script.
		$user = $this->userSession->getUser();
		if ($user === null) {
			return;
		}

		Util::addStyle(Application::APP_ID, 'menu-custom');
		Util::addScript(Application::APP_ID, 'menu-custom');

		// Ordre, masquages et portée effectifs pour l'utilisateur courant
		// (global + règles de son/ses groupe(s)), consommés par menu-custom.js
		// pour construire le tiroir et masquer les entrées du menu natif.
		$this->initialState->provideInitialState(
			'menuConfig',
			$this->menuConfigService->getEffectiveConfigForUser($user)
		);

		// Le tiroir est construit à partir de ces entrées côté serveur plutôt
		// qu'en clonant le header, dont la structure change à chaque version
		// majeure de Nextcloud.
		$this->initialState->provideInitialState(
			'navigation',
			$this->menuConfigService->getNavigationEntries('link')
		);
		$this->initialState->provideInitialState(
			'settingsNavigation',
			$this->menuConfigService->getNavigationEntries('settings')
		);
	}
}
