# Changelog

Toutes les modifications notables de `menucustom` sont documentées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) et le projet adhère au [versionnage sémantique](https://semver.org/lang/fr/).

## [2.2.0] - 2026-09-05

### Ajouté

- **La section « Compte » du tiroir devient optionnelle**, et est désormais **désactivée par défaut**. Un nouveau bloc « Tiroir mobile » dans les réglages admin permet de la réafficher. Ces entrées (réglages, statut, déconnexion) restent accessibles par l'avatar : les reprendre dans le tiroir l'allongeait sans rien apporter, et repoussait les applications hors de l'écran sur un téléphone. Reprend la décision de la 1.0.2, mais en la laissant au choix de l'admin.
- **Barre de titre du tiroir avec une croix de fermeture.** Le voile et la touche Échap fermaient déjà le tiroir, mais ni l'un ni l'autre ne se devine : sur un écran tactile il faut une cible visible. La barre reste collée en haut pendant le défilement.

### Modifié

- **Ergonomie tactile du tiroir**, pour une utilisation par des personnes non techniciennes sur téléphone et tablette :
  - lignes portées de 48 à 56px de haut, bien au-delà du minimum de 44px, avec un espacement plus généreux entre l'icône et le libellé ;
  - libellés à 16px (au lieu de la taille héritée du thème, plus petite) et icônes à 24px (au lieu de 20) ;
  - retour visuel à l'appui (`:active`) : au doigt il n'y a pas de survol, l'appui doit se voir immédiatement ;
  - la page courante est signalée par un liseré dans la couleur d'accent du thème, en plus du fond — un fond seul se repère mal dans une liste longue ;
  - tiroir élargi à `min(88vw, 340px)`, voile assombri, et retrait de sécurité (`safe-area-inset`) pris en compte à gauche et en haut pour les écrans à encoche ;
  - titres de section plus discrets, pour ne pas concurrencer visuellement les entrées ;
  - le défilement du tiroir ne se propage plus à la page derrière (`overscroll-behavior: contain`) ;
  - la pastille de repli (initiale du nom, pour une entrée sans icône) est posée sur un rond plutôt que flottante.
- Les animations d'ouverture sont désactivées pour les personnes ayant demandé une réduction des mouvements dans leur système (`prefers-reduced-motion`).

## [2.1.0] - 2026-09-05

### Ajouté

- **Liens personnalisés** : l'admin peut ajouter dans les réglages du menu un raccourci vers n'importe quelle adresse — site intranet, application métier, page interne de l'instance. Chaque lien porte un nom, une adresse, une icône, le choix d'ouvrir ou non dans un nouvel onglet, et une liste de groupes autorisés.
- Un lien est publié dans `INavigationManager` au démarrage de l'app : il apparaît donc **dans le menu d'applications natif de Nextcloud comme dans le tiroir mobile**, et se range dans le bloc « Ordre et visibilité » exactement comme une application — glisser-déposer, masquage global, et masquage par vue de groupes s'y appliquent sans réglage particulier. Un badge « lien » l'y distingue d'une vraie app.
- Les groupes d'un lien forment une **liste blanche** (« réservé à ces groupes »), complémentaire des vues qui sont une liste noire : la vue masque une entrée à certains groupes, le lien réserve son affichage aux siens. Le champ de recherche de groupes avec autocomplétion est celui des vues, généralisé.
- **Icônes** : soit l'adresse d'une image, soit un fichier téléversé (SVG, PNG, JPEG ou WebP, 256 Kio maximum) via la nouvelle route `POST /apps/menucustom/icon`, réservée aux admins. Sans icône, le tiroir affiche l'initiale du nom, comme pour une app sans icône. Les fichiers sont stockés dans l'`appdata` de l'instance et non dans le dossier de l'app, qui est remplacé à chaque mise à jour ; ceux qu'aucun lien n'utilise plus sont supprimés à l'enregistrement des réglages.
- Le type réel d'une icône téléversée est déduit de son contenu et non de l'en-tête envoyé par le navigateur, et son nom de fichier est généré côté serveur. La route de lecture (`GET /apps/menucustom/icon/{name}`, accessible à tout utilisateur connecté) sert le fichier avec une politique de sécurité vide (`default-src 'none'`) et `X-Content-Type-Options: nosniff` : un SVG contenant du script ne s'exécute pas, même ouvert directement.

### Corrigé

- Reprise du correctif 1.0.2 dans le chemin de secours par clonage du DOM : les icônes du header, blanches car prévues pour le fond fixe de la barre du haut, restaient quasi invisibles sur le fond du tiroir. `recolorClonedIcon()` les convertit en masque CSS teinté avec `--color-main-text`. Le chemin principal, construit à partir des données de `INavigationManager`, n'est pas concerné : il porte ses propres icônes.
- Le `target` des entrées de navigation était perdu à la construction du tiroir : une entrée demandant une ouverture dans un nouvel onglet — celles des liens personnalisés, mais aussi celles publiées par des apps tierces comme « Liens Externes » (`nc_external_links`) — s'ouvrait dans l'onglet courant. Le tiroir pose désormais `target="_blank"` et `rel="noopener noreferrer"`.

### Modifié

- Les icônes fournies par l'admin ne subissent plus l'inversion de couleurs appliquée en thème sombre aux icônes d'app de Nextcloud, qui sont des SVG monochromes.
- La configuration stockée gagne une clé `links` ; une configuration antérieure sans cette clé reste lue telle quelle, sans migration.

## [2.0.0] - 2026-09-05

### Renommé

- L'app « Mobile Menu » devient **« Menu Custom »** : elle ne se limite plus au mobile, elle personnalise aussi les raccourcis du menu d'applications sur PC. Le renommage porte sur toute l'identité de l'app — identifiant `mobilemenu` → `menucustom`, dossier, namespace `OCA\MobileMenu` → `OCA\MenuCustom`, préfixe des classes CSS `mobilemenu-*` → `menucustom-*`, fichiers `mobile-menu*.css/js` → `menu-custom*.css/js`, et URL des réglages `/apps/menucustom/settings`.
- Étape de réparation `ImportLegacyConfig` : à l'activation de `menucustom`, la configuration de l'ancienne app `mobilemenu` (ordre, masquages globaux et par groupe, portée) est reprise automatiquement, puis convertie au format courant — chaque masquage par groupe de la 1.x devient une vue à un seul groupe, nommée d'après le libellé de celui-ci. Celle de l'ancienne app n'est pas supprimée, pour qu'un retour en arrière reste possible.

### Ajouté

- **Vues par groupes** : une vue est un jeu d'entrées masquées associé à un ou plusieurs groupes. Plusieurs groupes qui doivent voir la même chose partagent une seule vue — par exemple « Personnel cantine » et « Personnel scolaire » dans une vue « École » — au lieu d'être configurés à l'identique un par un. Chaque vue est repliable et son en-tête résume son état (« 2 groupes · 3 entrées masquées »).
- **Champ de recherche de groupes avec autocomplétion**, en remplacement de la liste déroulante : la recherche est faite côté serveur (nouvelle route `GET /apps/menucustom/groups`, réservée aux admins, 25 résultats par défaut) au lieu d'envoyer tous les groupes au navigateur, ce qui reste utilisable sur une instance qui en compte des milliers. Motif « combobox » ARIA, pilotable au clavier (↓/↑, Entrée, Échap, et Retour arrière sur champ vide pour retirer le dernier groupe), avec mise en cache des recherches et anti-rebond de 250 ms.
- Un groupe déjà associé à une autre vue est signalé dans les suggestions (« déjà dans « X » ») : l'association reste possible, les masquages se cumulent alors.
- Un groupe supprimé de Nextcloud reste affiché dans sa vue et signalé comme tel, plutôt que retiré silencieusement de la configuration.
- **Portée du masquage** dans les réglages admin : choisir si les entrées masquées disparaissent partout (mobile, tablette et PC), uniquement du tiroir de l'app, ou uniquement du menu d'applications natif de Nextcloud. Permet par exemple de ne laisser au groupe « École » que les raccourcis utiles (sans Deck, Tâches ni Notes) sur tous ses appareils.
- Masquage du **menu d'applications natif** : les entrées masquées sont retirées de la barre du haut et de la grille d'applications, à toutes les largeurs d'écran. Aucun nœud n'est supprimé du DOM de Nextcloud : une classe CSS est posée puis réappliquée via un `MutationObserver` quand Vue re-rend le header ou ouvre la grille.
- L'ordre personnalisé est également appliqué au menu natif (via la propriété CSS `order`) lorsque la portée inclut le PC.
- Les entrées encore référencées par la configuration mais absentes de la navigation (app désactivée ou limitée à d'autres groupes) restent listées et signalées « app absente », au lieu d'être silencieusement perdues.

### Modifié

- **Compatibilité Nextcloud 34 (Hub 26 Spring)** : `max-version` portée à 34. Le tiroir est désormais construit à partir des entrées de `INavigationManager` fournies par le serveur, et non en clonant le DOM du header — la structure du menu d'applications change à chaque version majeure (grille d'apps de Hub 26), les données de navigation non. Le clonage du DOM reste en secours.
- Section « Compte » du tiroir construite à partir de la navigation de type `settings` : elle fonctionne même quand le menu utilisateur natif n'est pas encore monté dans le DOM.
- CSS des cibles tactiles étendu aux sélecteurs des trois générations de header (`#appmenu`, `.app-menu-entry`, grille d'applications).
- Configuration lue/écrite via `IAppConfig` au lieu de `IConfig::getAppValue()`, déprécié depuis Nextcloud 29.
- Le CSS/JS n'est plus chargé sur les pages publiques et l'écran de connexion.

### Note de migration

Le changement d'identifiant impose une réinstallation — remplacer le dossier ne suffit pas :

```bash
sudo -u www-data php /var/www/nextcloud/occ app:disable mobilemenu
sudo rm -rf /var/www/nextcloud/apps/mobilemenu
sudo cp -r menucustom /var/www/nextcloud/apps/
sudo chown -R www-data:www-data /var/www/nextcloud/apps/menucustom
sudo -u www-data php /var/www/nextcloud/occ app:enable menucustom
```

La configuration est reprise et convertie automatiquement à l'activation : les masquages par groupe de la 1.x deviennent des vues à un seul groupe, qu'il suffit ensuite de fusionner si plusieurs groupes doivent partager la même.

Attention aussi à la portée par défaut, qui est « partout » : les masquages configurés en 1.1.0, qui ne s'appliquaient qu'au tiroir mobile, s'appliquent désormais aussi au menu natif sur PC. Choisir « Tiroir mobile uniquement » dans les réglages pour retrouver le comportement précédent.

## [1.1.0] - 2026-06-08

### Ajouté

- Écran de réglages admin (« Réglages > Administration > Mobile Menu ») permettant de personnaliser le tiroir de navigation mobile :
  - réorganisation des entrées par glisser-déposer (ou boutons monter/descendre, accessibles au clavier) ;
  - masquage global d'une entrée pour tous les utilisateurs ;
  - masquage par groupe, pour adapter le menu aux besoins de chaque groupe (ex. masquer « Deck » pour le groupe « Responsables »).
- `MenuConfigService` : lecture/écriture de la configuration (stockée en JSON dans `appconfig`) et calcul de la configuration effective (ordre + entrées masquées) pour un utilisateur donné, en fusionnant les règles globales et celles de ses groupes.
- Le tiroir applique désormais cette configuration : les entrées masquées pour l'utilisateur courant n'apparaissent plus dans la section « Applications », et les entrées restantes respectent l'ordre personnalisé.

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
