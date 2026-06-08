<?php

declare(strict_types=1);

namespace OCA\MobileMenu\Service;

use OCA\MobileMenu\AppInfo\Application;
use OCP\IConfig;
use OCP\IGroupManager;
use OCP\INavigationManager;
use OCP\IUser;

/**
 * Lit, valide et applique la configuration du menu (ordre des entrées,
 * masquage global, masquage par groupe) enregistrée par l'admin.
 *
 * La configuration est stockée sous forme d'un unique blob JSON dans la
 * table appconfig, ce qui permet de la lire/écrire de façon atomique depuis
 * l'écran de réglages.
 */
class MenuConfigService {
	private const CONFIG_KEY = 'menu_config';

	public function __construct(
		private IConfig $config,
		private IGroupManager $groupManager,
		private INavigationManager $navigationManager,
	) {
	}

	/**
	 * @return array{order: string[], hidden: string[], groupHidden: array<string, string[]>}
	 */
	public function getConfig(): array {
		$raw = $this->config->getAppValue(Application::APP_ID, self::CONFIG_KEY, '');
		$decoded = $raw !== '' ? json_decode($raw, true) : null;
		if (!is_array($decoded)) {
			$decoded = [];
		}

		return [
			'order' => $this->sanitizeStringList($decoded['order'] ?? []),
			'hidden' => $this->sanitizeStringList($decoded['hidden'] ?? []),
			'groupHidden' => $this->sanitizeGroupHidden($decoded['groupHidden'] ?? []),
		];
	}

	/**
	 * @param string[] $order
	 * @param string[] $hidden
	 * @param array<string, string[]> $groupHidden
	 */
	public function setConfig(array $order, array $hidden, array $groupHidden): void {
		$payload = [
			'order' => $this->sanitizeStringList($order),
			'hidden' => $this->sanitizeStringList($hidden),
			'groupHidden' => $this->sanitizeGroupHidden($groupHidden),
		];

		$this->config->setAppValue(Application::APP_ID, self::CONFIG_KEY, json_encode($payload));
	}

	/**
	 * Ordre global et liste des entrées masquées pour un utilisateur donné :
	 * fusionne le masquage global avec celui des groupes auxquels il appartient.
	 *
	 * @return array{order: string[], hidden: string[]}
	 */
	public function getEffectiveConfigForUser(?IUser $user): array {
		$config = $this->getConfig();

		$hidden = $config['hidden'];
		if ($user !== null && $config['groupHidden'] !== []) {
			foreach ($this->groupManager->getUserGroupIds($user) as $groupId) {
				if (isset($config['groupHidden'][$groupId])) {
					$hidden = array_merge($hidden, $config['groupHidden'][$groupId]);
				}
			}
		}

		return [
			'order' => $config['order'],
			'hidden' => array_values(array_unique($hidden)),
		];
	}

	/**
	 * Entrées du menu d'applications, dans leur ordre natif, pour peupler
	 * l'écran de réglages (l'admin choisit parmi celles-ci).
	 *
	 * @return array<int, array{id: string, name: string}>
	 */
	public function getMenuEntries(): array {
		$entries = [];
		foreach ($this->navigationManager->getAll('link') as $entry) {
			$id = (string)($entry['id'] ?? '');
			if ($id === '') {
				continue;
			}

			$entries[] = [
				'id' => $id,
				'name' => (string)($entry['name'] ?? $id),
			];
		}

		return $entries;
	}

	/**
	 * @return array<int, array{id: string, name: string}>
	 */
	public function getGroups(): array {
		$groups = [];
		foreach ($this->groupManager->search('') as $group) {
			$groups[] = [
				'id' => $group->getGID(),
				'name' => $group->getDisplayName(),
			];
		}

		return $groups;
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
	 * @param mixed $value
	 * @return array<string, string[]>
	 */
	private function sanitizeGroupHidden($value): array {
		if (!is_array($value)) {
			return [];
		}

		$groupHidden = [];
		foreach ($value as $groupId => $appIds) {
			if (!is_string($groupId) || $groupId === '') {
				continue;
			}

			$appIds = $this->sanitizeStringList($appIds);
			if ($appIds !== []) {
				$groupHidden[$groupId] = $appIds;
			}
		}

		return $groupHidden;
	}
}
