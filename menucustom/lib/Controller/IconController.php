<?php

declare(strict_types=1);

namespace OCA\MenuCustom\Controller;

use OCA\MenuCustom\AppInfo\Application;
use OCA\MenuCustom\Service\IconService;
use OCA\MenuCustom\Service\MenuConfigService;
use OCA\MenuCustom\Settings\Admin;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\AuthorizedAdminSetting;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\IRequest;

/**
 * Téléversement et service des icônes des liens personnalisés.
 */
class IconController extends Controller {
	public function __construct(
		IRequest $request,
		private IconService $iconService,
		private MenuConfigService $menuConfigService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * Enregistre une icône envoyée depuis l'écran de réglages et renvoie la
	 * référence à stocker dans le lien (`upload:<nom>`) ainsi que son URL, pour
	 * afficher immédiatement l'aperçu.
	 */
	#[AuthorizedAdminSetting(settings: Admin::class)]
	public function upload(): DataResponse {
		$file = $this->request->getUploadedFile('icon');
		if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
			return new DataResponse(['message' => 'Aucun fichier reçu'], Http::STATUS_BAD_REQUEST);
		}

		$content = file_get_contents($file['tmp_name']);
		if ($content === false) {
			return new DataResponse(['message' => 'Fichier illisible'], Http::STATUS_BAD_REQUEST);
		}

		try {
			$name = $this->iconService->store($content);
		} catch (\RuntimeException $e) {
			return new DataResponse(['message' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			return new DataResponse(['message' => 'Enregistrement impossible'], Http::STATUS_INTERNAL_SERVER_ERROR);
		}

		$icon = MenuConfigService::ICON_UPLOAD_PREFIX . $name;

		return new DataResponse([
			'icon' => $icon,
			'url' => $this->menuConfigService->resolveIconUrl($icon),
		]);
	}

	/**
	 * Sert une icône stockée. Accessible à tout utilisateur connecté : elle est
	 * chargée par le menu de chacun, pas seulement par l'administrateur.
	 *
	 * Un SVG téléversé peut embarquer du script ; il ne s'exécute pas lorsque le
	 * fichier est chargé via `<img>`, mais bien si l'URL est ouverte directement.
	 * D'où la politique de sécurité vide (`default-src 'none'`) et le `nosniff`.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function getIcon(string $name): DataDisplayResponse {
		try {
			$icon = $this->iconService->read($name);
		} catch (\Throwable $e) {
			// Nom invalide, fichier absent, appdata indisponible : dans tous
			// les cas, il n'y a pas d'image à servir.
			return new DataDisplayResponse('', Http::STATUS_NOT_FOUND);
		}

		$response = new DataDisplayResponse($icon['content'], Http::STATUS_OK, [
			'Content-Type' => $icon['mime'],
			'X-Content-Type-Options' => 'nosniff',
			'Content-Disposition' => 'inline',
		]);
		$response->setContentSecurityPolicy(new EmptyContentSecurityPolicy());

		// Le nom de fichier est régénéré à chaque téléversement, le contenu
		// derrière une URL donnée ne change donc jamais.
		$response->cacheFor(2592000, false, true);

		return $response;
	}
}
