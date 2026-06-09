<?php

declare(strict_types=1);

namespace OCA\MobileMenu\Controller;

use OCA\MobileMenu\AppInfo\Application;
use OCA\MobileMenu\Settings\AdminSettings;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\AuthorizedAdminSetting;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;

class AdminSettingsController extends Controller {

	public function __construct(
		IRequest $request,
		private readonly IConfig $config,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[AuthorizedAdminSetting(settings: AdminSettings::class)]
	public function save(): JSONResponse {
		$raw = $this->request->getParam('restrictions', []);
		$sanitized = [];
		if (is_array($raw)) {
			foreach ($raw as $groupId => $apps) {
				if (is_string($groupId) && is_array($apps)) {
					$sanitized[$groupId] = array_values(
						array_unique(array_filter($apps, 'is_string'))
					);
				}
			}
		}
		$this->config->setAppValue(Application::APP_ID, 'group_restrictions', json_encode($sanitized));
		return new JSONResponse(['status' => 'success']);
	}
}
