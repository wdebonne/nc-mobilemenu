<?php

declare(strict_types=1);

namespace OCA\MenuCustom\Settings;

use OCA\MenuCustom\AppInfo\Application;
use OCA\MenuCustom\Service\MenuConfigService;
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
		$config = $this->menuConfigService->getConfig();

		// Seuls les groupes déjà associés à une vue ou à un lien sont envoyés
		// d'emblée, pour pouvoir afficher leur libellé ; les autres arrivent par
		// l'autocomplétion, qui interroge le serveur au fil de la frappe.
		$groupIds = [];
		foreach ($config['views'] as $view) {
			$groupIds = array_merge($groupIds, $view['groups']);
		}
		foreach ($config['links'] as $link) {
			$groupIds = array_merge($groupIds, $link['groups']);
		}

		$this->initialState->provideInitialState('entries', $this->menuConfigService->getMenuEntries());
		$this->initialState->provideInitialState('groups', $this->menuConfigService->getGroupsByIds($groupIds));
		$this->initialState->provideInitialState('config', $config);

		Util::addScript(Application::APP_ID, 'menu-custom-admin');
		Util::addStyle(Application::APP_ID, 'menu-custom-admin');

		return new TemplateResponse(Application::APP_ID, 'admin', [], '');
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 50;
	}
}
