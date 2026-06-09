<?php

declare(strict_types=1);

namespace OCA\MobileMenu\Listener;

use OCA\MobileMenu\AppInfo\Application;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\IConfig;
use OCP\IGroup;
use OCP\IGroupManager;
use OCP\IUserSession;
use OCP\Util;

/**
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class BeforeTemplateRenderedListener implements IEventListener {

	public function __construct(
		private readonly IConfig $config,
		private readonly IGroupManager $groupManager,
		private readonly IUserSession $userSession,
		private readonly IInitialState $initialState,
	) {}

	public function handle(Event $event): void {
		if (!($event instanceof BeforeTemplateRenderedEvent)) {
			return;
		}

		Util::addStyle(Application::APP_ID, 'mobile-menu');
		Util::addScript(Application::APP_ID, 'mobile-menu');

		$user = $this->userSession->getUser();
		if ($user === null) {
			return;
		}

		$json = $this->config->getAppValue(Application::APP_ID, 'group_restrictions', '{}');
		$restrictions = json_decode($json, true);
		if (!is_array($restrictions) || empty($restrictions)) {
			return;
		}

		$userGroupIds = array_map(
			static fn (IGroup $g) => $g->getGID(),
			$this->groupManager->getUserGroups($user)
		);

		$hidden = [];
		foreach ($userGroupIds as $groupId) {
			if (isset($restrictions[$groupId]) && is_array($restrictions[$groupId])) {
				foreach ($restrictions[$groupId] as $appId) {
					$hidden[$appId] = true;
				}
			}
		}

		if (!empty($hidden)) {
			$this->initialState->provideInitialState('hidden_apps', array_keys($hidden));
		}
	}
}
