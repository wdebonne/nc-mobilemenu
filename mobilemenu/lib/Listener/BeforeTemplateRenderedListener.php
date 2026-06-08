<?php

declare(strict_types=1);

namespace OCA\MobileMenu\Listener;

use OCA\MobileMenu\AppInfo\Application;
use OCA\MobileMenu\Service\MenuConfigService;
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

		Util::addStyle(Application::APP_ID, 'mobile-menu');
		Util::addScript(Application::APP_ID, 'mobile-menu');

		// Ordre et masquages effectifs pour l'utilisateur courant (global +
		// règles de son/ses groupe(s)), consommés par mobile-menu.js pour
		// construire le tiroir « Applications ».
		$this->initialState->provideInitialState(
			'menuConfig',
			$this->menuConfigService->getEffectiveConfigForUser($this->userSession->getUser())
		);
	}
}
