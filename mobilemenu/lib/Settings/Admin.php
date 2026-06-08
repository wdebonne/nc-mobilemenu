<?php

declare(strict_types=1);

namespace OCA\MobileMenu\Settings;

use OCA\MobileMenu\AppInfo\Application;
use OCA\MobileMenu\Service\MenuConfigService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\Settings\ISettings;
use OCP\Util;

class Admin implements ISettings {
	public function __construct(
		private IInitialState $initialState,
		private MenuConfigService $menuConfigService,
	) {
	}

	public function getForm(): TemplateResponse {
		$this->initialState->provideInitialState('entries', $this->menuConfigService->getMenuEntries());
		$this->initialState->provideInitialState('groups', $this->menuConfigService->getGroups());
		$this->initialState->provideInitialState('config', $this->menuConfigService->getConfig());

		Util::addScript(Application::APP_ID, 'mobile-menu-admin');
		Util::addStyle(Application::APP_ID, 'mobile-menu-admin');

		return new TemplateResponse(Application::APP_ID, 'admin', [], '');
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 50;
	}
}
