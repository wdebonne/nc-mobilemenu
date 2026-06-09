# Changelog

Toutes les modifications notables de `mobilemenu` sont documentées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et le projet adhère au [versionnage sémantique](https://semver.org/lang/fr/).

## [1.0.2] - 2026-06-08

### Modifié

- Le tiroir n'affiche plus que la section « Applications » ; la section « Compte » (clonée du menu utilisateur) a été retirée pour ne pas dupliquer le menu natif accessible via l'avatar.

### Corrigé

- Les icônes d'applications clonées dans le tiroir restaient blanches (prévues pour le fond fixe de la barre du haut), donc quasi invisibles sur le fond clair du tiroir et potentiellement à l'inverse en thème sombre. `recolorIcon()` les convertit désormais en masques CSS teintés avec `--color-main-text`, la couleur de texte du thème courant : silhouette sombre en thème clair, claire en thème sombre — sans avoir à détecter le thème.
- Après la récolte des liens du menu natif « plus d'applications », celui-ci pouvait rester ouvert au premier plan (un simple second clic entrait en compétition avec sa propre détection de clic extérieur, le rouvrant aussitôt). `closeOverflowPopover()` essaie désormais plusieurs mécanismes de fermeture (Échap, clic sur le voile du popover, re-clic sur le déclencheur) et vérifie `aria-expanded` après chacun, jusqu'à confirmation de la fermeture.

## [1.0.1] - 2026-06-08

### Corrigé

- La section « Applications » du tiroir restait vide sur les instances où la barre du haut replie toutes les applications dans le menu natif « plus d'applications » (`···`), donnant l'impression que le tiroir affichait uniquement le menu « Compte ». Le menu « plus d'applications » étant un popover Vue dont le contenu n'est monté que pendant son ouverture, `mobile-menu.js` l'ouvre désormais brièvement (masqué via CSS, sans clignotement) pour en cloner les liens, met le résultat en cache, puis le referme — la section « Applications » affiche enfin Tableau de bord, Talk, Fichiers, etc.

## [1.0.0] - 2026-06-08

### Ajouté

- Bouton hamburger et tiroir de navigation coulissant (off-canvas) pour mobile/tablette (≤ 1024px), avec fermeture par Échap, clic extérieur ou sélection d'un lien, et attributs ARIA pour l'accessibilité.
- Agrandissement des cibles tactiles (icônes, liens, boutons de la barre du haut) à au moins 44×44px sur mobile/tablette, sans impact sur l'affichage desktop.
- Injection globale du CSS/JS via `BeforeTemplateRenderedEvent` (`Util::addStyle` / `Util::addScript`), sans modification du cœur de Nextcloud.
