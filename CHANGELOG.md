# Changelog

Toutes les modifications notables de `mobilemenu` sont documentées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et le projet adhère au [versionnage sémantique](https://semver.org/lang/fr/).

## [1.1.0] - 2026-06-08

### Ajouté

- Écran de réglages admin (« Réglages > Administration > Mobile Menu ») permettant de personnaliser le tiroir de navigation mobile :
  - réorganisation des entrées par glisser-déposer (ou boutons monter/descendre, accessibles au clavier) ;
  - masquage global d'une entrée pour tous les utilisateurs ;
  - masquage par groupe, pour adapter le menu aux besoins de chaque groupe (ex. masquer « Deck » pour le groupe « Responsables »).
- `MenuConfigService` : lecture/écriture de la configuration (stockée en JSON dans `appconfig`) et calcul de la configuration effective (ordre + entrées masquées) pour un utilisateur donné, en fusionnant les règles globales et celles de ses groupes.
- Le tiroir applique désormais cette configuration : les entrées masquées pour l'utilisateur courant n'apparaissent plus dans la section « Applications », et les entrées restantes respectent l'ordre personnalisé.

## [1.0.0] - 2026-06-08

### Ajouté

- Bouton hamburger et tiroir de navigation coulissant (off-canvas) pour mobile/tablette (≤ 1024px), avec fermeture par Échap, clic extérieur ou sélection d'un lien, et attributs ARIA pour l'accessibilité.
- Agrandissement des cibles tactiles (icônes, liens, boutons de la barre du haut) à au moins 44×44px sur mobile/tablette, sans impact sur l'affichage desktop.
- Injection globale du CSS/JS via `BeforeTemplateRenderedEvent` (`Util::addStyle` / `Util::addScript`), sans modification du cœur de Nextcloud.
