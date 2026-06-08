# nc-mobilemenu

App Nextcloud qui rend la barre de navigation du haut **utilisable au tactile** sur mobile et tablette : menu hamburger, tiroir de navigation coulissant et cibles tactiles agrandies — sans toucher à l'interface desktop.

## Pourquoi cette app ?

Sur mobile/tablette, la barre du haut de Nextcloud peut être difficile à utiliser au doigt : icônes/liens trop petits ou trop rapprochés, pas de menu repliable adapté au tactile. `mobilemenu` ajoute une couche légère, purement front-end, qui :

- affiche un **bouton hamburger** sous un certain breakpoint (≤ 1024px) ;
- ouvre un **tiroir de navigation** (drawer) regroupant le menu d'applications et le menu utilisateur, avec gestion clavier (Échap), clic extérieur pour fermer, et attributs ARIA pour l'accessibilité ;
- **agrandit les cibles tactiles** (icônes, liens, boutons) à au moins 44×44px ;
- permet à l'admin de **personnaliser le contenu du tiroir** : ordre des entrées, masquage global, et masquage par groupe d'utilisateurs (ex. masquer « Deck » pour le groupe « Responsables ») ;
- ne modifie **rien** au-dessus de 1024px : l'expérience desktop native de Nextcloud reste intacte.

## Comment ça marche

L'app `mobilemenu` ne modifie aucun fichier du cœur de Nextcloud. Elle s'enregistre sur l'évènement `BeforeTemplateRenderedEvent` (mécanisme officiel pour charger du CSS/JS sur chaque page rendue) et injecte :

- [`css/mobile-menu.css`](mobilemenu/css/mobile-menu.css) — media queries qui agrandissent les cibles tactiles et stylent le tiroir/bouton hamburger ;
- [`js/mobile-menu.js`](mobilemenu/js/mobile-menu.js) — script vanilla JS qui construit le bouton hamburger et le tiroir en **clonant** les liens existants du menu d'apps (`#appmenu`) et du menu utilisateur (sans jamais déplacer ou modifier le DOM original, pour rester compatible avec les composants Vue de Nextcloud).

## Structure du projet

```
mobilemenu/
├── appinfo/info.xml                                  # métadonnées de l'app (id, version, dépendances, réglages)
├── appinfo/routes.php                                # route AJAX de sauvegarde des réglages admin
├── lib/AppInfo/Application.php                       # bootstrap : enregistre le listener
├── lib/Listener/BeforeTemplateRenderedListener.php   # injecte le CSS/JS + la config effective sur chaque page HTML
├── lib/Service/MenuConfigService.php                 # lecture/écriture de la config + calcul de la config par utilisateur
├── lib/Settings/AdminSection.php                     # section « Mobile Menu » dans Réglages > Administration
├── lib/Settings/Admin.php                            # page de réglages admin (ordre, masquage global/par groupe)
├── lib/Controller/SettingsController.php             # endpoint AJAX de sauvegarde des réglages (admin uniquement)
├── templates/admin.php                               # gabarit de la page de réglages admin
├── css/mobile-menu.css                               # styles responsives (cibles tactiles + drawer)
├── css/mobile-menu-admin.css                         # styles de la page de réglages admin
├── js/mobile-menu.js                                 # bouton hamburger + tiroir de navigation
├── js/mobile-menu-admin.js                           # logique de la page de réglages admin (ordre, masquage)
└── img/app.svg                                       # icône de l'app
```

## Prérequis

- Nextcloud **30 à 33** (déclaré dans `appinfo/info.xml`)
- Accès admin/SSH au serveur pour copier l'app dans le dossier `apps/` et l'activer

## Installation

```bash
# 1. Copier le dossier de l'app sur le serveur
scp -r mobilemenu utilisateur@serveur:/tmp/

# 2. Se connecter et déplacer l'app dans le dossier apps/ de Nextcloud
ssh utilisateur@serveur
sudo mv /tmp/mobilemenu /var/www/nextcloud/apps/
sudo chown -R www-data:www-data /var/www/nextcloud/apps/mobilemenu

# 3. Activer l'app
sudo -u www-data php /var/www/nextcloud/occ app:enable mobilemenu
```

## Vérification

1. Ouvrir Nextcloud dans un navigateur.
2. Passer en mode responsive (DevTools), tester des largeurs ~375px (mobile) et ~768px (tablette).
3. Vérifier :
   - l'apparition du bouton hamburger dans la barre du haut ;
   - l'ouverture/fermeture fluide du tiroir (clic sur le bouton, sur l'overlay, touche Échap, sélection d'un lien) ;
   - des cibles tactiles visiblement plus grandes ;
   - **aucun changement** au-dessus de 1024px de large.

## Réglages admin : ordre, masquage global et par groupe

Une nouvelle section **« Mobile Menu »** apparaît dans *Réglages > Administration* et permet de personnaliser le contenu du tiroir de navigation **sans toucher au code** :

- **Ordre et visibilité** : glissez-déposez les entrées (ou utilisez les boutons ↑/↓, accessibles au clavier) pour changer leur ordre dans le tiroir, et décochez celles à masquer pour **tout le monde**.
- **Masquage par groupe** : choisissez un groupe dans la liste déroulante, puis cochez les entrées à masquer **uniquement pour ses membres**. Par exemple, pour qu'un membre du groupe « Responsables » n'ait pas « Deck » dans son tiroir alors que les autres l'ont toujours :
  1. Ouvrir *Réglages > Administration > Mobile Menu*.
  2. Dans « Masquage par groupe », sélectionner le groupe « Responsables ».
  3. Cocher « Deck » dans la liste qui apparaît.

Les modifications sont enregistrées automatiquement (AJAX, avec un court délai anti-rebond) et s'appliquent immédiatement à l'ouverture suivante du tiroir pour les utilisateurs concernés.

Notes importantes :

- Ces réglages **n'affectent que le tiroir de cette app** sur mobile/tablette ; le menu d'applications natif de Nextcloud sur desktop n'est pas modifié (conformément au principe de l'app de ne jamais toucher au DOM natif).
- Le masquage est **uniquement visuel** : une entrée masquée disparaît du tiroir mais l'app reste accessible si l'utilisateur connaît son URL directe. Pour une **restriction d'accès réelle** par groupe, utilisez la fonctionnalité native de Nextcloud *Réglages > Applications > « Limiter aux groupes »*.
- La configuration est stockée côté serveur (table `appconfig`, sous forme de JSON) via [`MenuConfigService`](mobilemenu/lib/Service/MenuConfigService.php), et la configuration effective (ordre + entrées masquées) est calculée par utilisateur dans [`BeforeTemplateRenderedListener`](mobilemenu/lib/Listener/BeforeTemplateRenderedListener.php) en fusionnant les règles globales avec celles des groupes de l'utilisateur.

## Personnalisation

Les sélecteurs CSS du header (`#header`, `#appmenu`, `#user-menu`, …) peuvent varier légèrement selon la version de Nextcloud ou un thème personnalisé. Si le menu ne s'affiche pas correctement :

1. Inspecter le DOM réel via les DevTools du navigateur.
2. Ajuster les sélecteurs dans [`mobile-menu.js`](mobilemenu/js/mobile-menu.js) (fonction `populateDrawer`) et [`mobile-menu.css`](mobilemenu/css/mobile-menu.css).
3. Le breakpoint mobile/tablette (`1024px`) peut être modifié dans les deux fichiers (`BREAKPOINT` en JS, `@media` en CSS) — garder les deux synchronisés.

## Licence

AGPL (voir `appinfo/info.xml`).
