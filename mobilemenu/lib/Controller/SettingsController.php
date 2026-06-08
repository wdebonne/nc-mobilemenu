<?php

declare(strict_types=1);

namespace OCA\MobileMenu\Controller;

use OCA\MobileMenu\AppInfo\Application;
use OCA\MobileMenu\Service\MenuConfigService;
use OCA\MobileMenu\Settings\Admin;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\AuthorizedAdminSetting;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class SettingsController extends Controller {
	public function __construct(
		IRequest $request,
		private MenuConfigService $menuConfigService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * Enregistre l'ordre du menu, les entrées masquées globalement et les
	 * entrées masquées par groupe, depuis l'écran de réglages admin.
	 *
	 * @param string[] $order
	 * @param string[] $hidden
	 * @param array<string, string[]> $groupHidden
	 */
	#[AuthorizedAdminSetting(settings: Admin::class)]
	public function save(array $order, array $hidden, array $groupHidden): DataResponse {
		$this->menuConfigService->setConfig($order, $hidden, $groupHidden);

		return new DataResponse($this->menuConfigService->getConfig());
	}
}
