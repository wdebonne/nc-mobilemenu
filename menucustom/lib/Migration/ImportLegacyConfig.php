<?php

declare(strict_types=1);

namespace OCA\MenuCustom\Migration;

use OCA\MenuCustom\AppInfo\Application;
use OCA\MenuCustom\Service\MenuConfigService;
use OCP\IAppConfig;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

/**
 * Reprend la configuration de l'ancienne app « mobilemenu », renommée en
 * « menucustom » en 2.0.0, puis normalise la configuration stockée au format
 * courant (les masquages par groupe de la 1.x deviennent des vues).
 *
 * Le changement d'identifiant impose de désactiver l'ancienne app et d'activer
 * la nouvelle : sans cette étape, l'admin devrait ressaisir tout l'ordre et
 * tous les masquages. La configuration de l'ancienne app n'est pas supprimée,
 * pour qu'un retour en arrière reste possible.
 */
class ImportLegacyConfig implements IRepairStep {
	private const LEGACY_APP_ID = 'mobilemenu';
	private const CONFIG_KEY = 'menu_config';

	public function __construct(
		private IAppConfig $appConfig,
		private MenuConfigService $menuConfigService,
	) {
	}

	public function getName(): string {
		return 'Menu Custom : reprise et normalisation de la configuration';
	}

	public function run(IOutput $output): void {
		try {
			$this->importFromLegacyApp($output);
			// Convertit `groupHidden` en vues et donne aux vues converties le
			// libellé du groupe plutôt que son identifiant.
			$this->menuConfigService->normaliseStoredConfig();
		} catch (\Throwable $e) {
			// Une reprise de configuration ne doit jamais faire échouer une
			// activation ou une mise à jour.
			$output->warning('Configuration non reprise : ' . $e->getMessage());
		}
	}

	private function importFromLegacyApp(IOutput $output): void {
		if ($this->appConfig->getValueString(Application::APP_ID, self::CONFIG_KEY, '') !== '') {
			// Déjà configurée : ne rien écraser.
			return;
		}

		$legacy = $this->appConfig->getValueString(self::LEGACY_APP_ID, self::CONFIG_KEY, '');
		if ($legacy === '') {
			return;
		}

		$this->appConfig->setValueString(Application::APP_ID, self::CONFIG_KEY, $legacy);
		$output->info('Configuration reprise depuis l\'app « mobilemenu ».');
	}
}
