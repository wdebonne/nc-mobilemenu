# Changelog

Toutes les modifications notables de `mobilemenu` sont documentées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et le projet adhère au [versionnage sémantique](https://semver.org/lang/fr/).

## [1.0.0] - 2026-06-08

### Ajouté

- Bouton hamburger et tiroir de navigation coulissant (off-canvas) pour mobile/tablette (≤ 1024px), avec fermeture par Échap, clic extérieur ou sélection d'un lien, et attributs ARIA pour l'accessibilité.
- Agrandissement des cibles tactiles (icônes, liens, boutons de la barre du haut) à au moins 44×44px sur mobile/tablette, sans impact sur l'affichage desktop.
- Injection globale du CSS/JS via `BeforeTemplateRenderedEvent` (`Util::addStyle` / `Util::addScript`), sans modification du cœur de Nextcloud.
