<?php

declare(strict_types=1);

namespace OCA\MobileMenu\Listener;

use OCA\MobileMenu\AppInfo\Application;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class BeforeTemplateRenderedListener implements IEventListener {
	public function handle(Event $event): void {
		if (!($event instanceof BeforeTemplateRenderedEvent)) {
			return;
		}

		Util::addStyle(Application::APP_ID, 'mobile-menu');
		Util::addScript(Application::APP_ID, 'mobile-menu');
	}
}
