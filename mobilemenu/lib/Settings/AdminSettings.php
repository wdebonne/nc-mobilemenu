<?php

declare(strict_types=1);

namespace OCA\MobileMenu\Settings;

use OCA\MobileMenu\AppInfo\Application;
use OCP\App\IAppManager;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IGroupManager;
use OCP\Settings\ISettings;

class AdminSettings implements ISettings {

	public function __construct(
		private readonly IConfig $config,
		private readonly IGroupManager $groupManager,
		private readonly IAppManager $appManager,
	) {}

	public function getForm(): TemplateResponse {
		$json = $this->config->getAppValue(Application::APP_ID, 'group_restrictions', '{}');
		$restrictions = json_decode($json, true);
		if (!is_array($restrictions)) {
			$restrictions = [];
		}

		$groups = [];
		foreach ($this->groupManager->search('') as $group) {
			$groups[] = [
				'id'   => $group->getGID(),
				'name' => $group->getDisplayName(),
			];
		}
		usort($groups, static fn ($a, $b) => strcasecmp((string) $a['name'], (string) $b['name']));

		$apps = [];
		foreach ($this->appManager->getInstalledApps() as $appId) {
			if ($appId === Application::APP_ID) {
				continue;
			}
			$info = $this->appManager->getAppInfo($appId);
			$name = $appId;
			if (is_array($info) && isset($info['name'])) {
				$raw  = $info['name'];
				$name = is_array($raw) ? (string) ($raw['_value'] ?? $raw[0] ?? $appId) : (string) $raw;
			}
			$apps[] = ['id' => $appId, 'name' => $name];
		}
		usort($apps, static fn ($a, $b) => strcasecmp((string) $a['name'], (string) $b['name']));

		return new TemplateResponse(Application::APP_ID, 'admin', [
			'adminData' => json_encode([
				'restrictions' => $restrictions,
				'groups'       => $groups,
				'apps'         => $apps,
			]),
		]);
	}

	public function getSection(): string {
		return 'additional';
	}

	public function getPriority(): int {
		return 50;
	}
}
