<?php

declare(strict_types=1);

namespace OCA\MenuCustom\Service;

use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\Files\SimpleFS\ISimpleFolder;

/**
 * Stockage des icônes téléversées pour les liens personnalisés.
 *
 * Les fichiers vont dans l'appdata de l'instance et non dans le répertoire de
 * l'app : ce dernier est remplacé à chaque mise à jour, ce qui effacerait les
 * icônes de l'administrateur.
 *
 * Le nom du fichier est toujours généré ici, jamais repris de celui envoyé par
 * le navigateur, et le type est déduit du contenu plutôt que de l'en-tête
 * déclaré par le client.
 */
class IconService {
	private const FOLDER = 'icons';

	/** 256 Kio : très au-delà d'une icône raisonnable, assez bas pour borner l'appdata. */
	public const MAX_SIZE = 262144;

	/** Type renvoyé au navigateur pour chaque extension acceptée. */
	private const MIME_TYPES = [
		'svg' => 'image/svg+xml',
		'png' => 'image/png',
		'jpg' => 'image/jpeg',
		'webp' => 'image/webp',
	];

	public function __construct(
		private IAppData $appData,
	) {
	}

	/**
	 * Nom de fichier d'icône légitime : uniquement ceux que `store()` a pu
	 * produire. Sert aussi bien à valider la configuration enregistrée qu'à
	 * contraindre le paramètre de la route de lecture.
	 */
	public static function isValidName(string $name): bool {
		return preg_match('/^[a-f0-9]{16}\.(svg|png|jpg|webp)$/', $name) === 1;
	}

	/**
	 * Enregistre une icône et renvoie son nom de fichier.
	 *
	 * @throws \RuntimeException si le contenu n'est pas une image d'un type accepté
	 */
	public function store(string $content): string {
		if ($content === '') {
			throw new \RuntimeException('Fichier vide');
		}

		if (strlen($content) > self::MAX_SIZE) {
			throw new \RuntimeException('Fichier trop volumineux');
		}

		$extension = $this->detectExtension($content);
		if ($extension === null) {
			throw new \RuntimeException('Format non pris en charge : SVG, PNG, JPEG ou WebP attendu');
		}

		$name = bin2hex(random_bytes(8)) . '.' . $extension;
		$this->folder()->newFile($name, $content);

		return $name;
	}

	/**
	 * Contenu et type d'une icône stockée.
	 *
	 * @return array{content: string, mime: string}
	 * @throws NotFoundException
	 */
	public function read(string $name): array {
		if (!self::isValidName($name)) {
			throw new NotFoundException('Nom de fichier invalide');
		}

		$extension = strtolower((string)pathinfo($name, PATHINFO_EXTENSION));

		return [
			'content' => $this->folder()->getFile($name)->getContent(),
			'mime' => self::MIME_TYPES[$extension] ?? 'application/octet-stream',
		];
	}

	/**
	 * Supprime les icônes qu'aucun lien ne référence plus, pour que l'appdata
	 * ne conserve pas indéfiniment les fichiers remplacés ou orphelins.
	 *
	 * @param string[] $keptNames noms de fichiers encore utilisés
	 */
	public function purge(array $keptNames): void {
		$kept = array_flip($keptNames);

		try {
			$files = $this->folder()->getDirectoryListing();
		} catch (\Throwable $e) {
			return;
		}

		foreach ($files as $file) {
			if (isset($kept[$file->getName()])) {
				continue;
			}

			try {
				$file->delete();
			} catch (NotPermittedException $e) {
				// Une icône qu'on n'arrive pas à supprimer n'est pas un échec
				// de l'enregistrement des réglages.
			}
		}
	}

	/**
	 * Extension à retenir pour un contenu, ou `null` s'il n'est pas une image
	 * d'un type accepté.
	 */
	private function detectExtension(string $content): ?string {
		// Pour le matriciel, `getimagesizefromstring()` confirme aussi que
		// l'image est réellement décodable, là où un test d'en-tête se
		// contenterait des premiers octets.
		$info = @getimagesizefromstring($content);
		if (is_array($info)) {
			return match ($info[2] ?? null) {
				IMAGETYPE_PNG => 'png',
				IMAGETYPE_JPEG => 'jpg',
				IMAGETYPE_WEBP => 'webp',
				default => null,
			};
		}

		return $this->isSvg($content) ? 'svg' : null;
	}

	/**
	 * `IMimeTypeDetector` ramène délibérément le SVG à `text/plain` — il le
	 * considère comme non sûr — et ne peut donc pas servir à le reconnaître :
	 * on vérifie nous-mêmes que le contenu est du XML dont la racine est `svg`.
	 */
	private function isSvg(string $content): bool {
		$previous = libxml_use_internal_errors(true);
		// `LIBXML_NONET` interdit toute récupération de ressource distante
		// pendant l'analyse.
		$document = simplexml_load_string($content, 'SimpleXMLElement', LIBXML_NONET);
		libxml_clear_errors();
		libxml_use_internal_errors($previous);

		return $document !== false && strtolower($document->getName()) === 'svg';
	}

	private function folder(): ISimpleFolder {
		try {
			return $this->appData->getFolder(self::FOLDER);
		} catch (NotFoundException $e) {
			return $this->appData->newFolder(self::FOLDER);
		}
	}
}
