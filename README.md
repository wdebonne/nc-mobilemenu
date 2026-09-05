# nc-menucustom

App Nextcloud qui rend la navigation **utilisable au tactile** sur mobile et tablette (menu hamburger, tiroir coulissant, cibles tactiles agrandies) et qui permet à l'admin de **choisir les raccourcis d'applications visibles, par groupes d'utilisateurs, sur mobile, tablette et PC**.

Testée sur Nextcloud **34 (Hub 26 Spring)**, compatible à partir de Nextcloud 30.

## Pourquoi cette app ?

Deux besoins, une seule app légère et purement front-end :

**1. Rendre le header utilisable au doigt.** Sur mobile/tablette, la barre du haut peut être difficile à manipuler : icônes trop petites ou trop rapprochées, pas de menu repliable adapté au tactile. `menucustom` :

- affiche un **bouton hamburger** sous un certain breakpoint (≤ 1024px) ;
- ouvre un **tiroir de navigation** (drawer) regroupant les applications et le menu du compte, avec gestion clavier (Échap), clic extérieur pour fermer et attributs ARIA ;
- **agrandit les cibles tactiles** (icônes, liens, boutons) à au moins 44×44px ;
- ne modifie **rien** au-dessus de 1024px : l'expérience desktop native reste intacte.

**2. Réduire le nombre de raccourcis pour le personnel non technique.** Un utilisateur qui n'a besoin que de Fichiers, Talk et Agenda n'a pas à voir Deck, Tâches et Notes : moins de boutons, meilleure reconnaissance, moins de perturbation. L'admin décide **quelles entrées sont visibles pour quel groupe**, et **où** (mobile, tablette, PC, ou tout).

**3. Ajouter les raccourcis qui manquent.** Un intranet, une application métier, un annuaire : l'admin ajoute un **lien personnalisé** dans les mêmes réglages, et il prend place dans le menu comme n'importe quelle app — ordre, masquage et vues par groupes compris.

## Comment ça marche

L'app ne modifie aucun fichier du cœur de Nextcloud. Elle s'enregistre sur l'évènement `BeforeTemplateRenderedEvent` (mécanisme officiel pour charger du CSS/JS sur chaque page rendue) et injecte [`css/menu-custom.css`](menucustom/css/menu-custom.css) et [`js/menu-custom.js`](menucustom/js/menu-custom.js), accompagnés de la configuration effective de l'utilisateur courant.

Deux principes guident l'implémentation :

- **Le tiroir est construit à partir des données de navigation du serveur** (`INavigationManager`), pas en clonant le DOM du header. La structure du menu d'applications change à chaque version majeure de Nextcloud — la grille d'applications de Hub 26 / NC 34 en est le dernier exemple — alors que les données de navigation, elles, sont stables. Le clonage du DOM reste en secours si l'état initial n'est pas disponible.
- **Le menu natif n'est jamais démonté.** Pour masquer une entrée, le script pose une classe CSS (`menucustom-native-hidden`) et la réapplique via un `MutationObserver` quand Vue re-rend le header ou ouvre la grille d'applications. Aucun nœud du DOM de Nextcloud n'est déplacé ou supprimé.

## Structure du projet

```
menucustom/
├── appinfo/info.xml                                  # métadonnées de l'app (id, version, dépendances, réglages)
├── appinfo/routes.php                                # routes AJAX : réglages, recherche de groupes, icônes des liens
├── lib/AppInfo/Application.php                       # bootstrap : listener + publication des liens personnalisés
├── lib/Listener/BeforeTemplateRenderedListener.php   # injecte le CSS/JS + la config et la navigation de l'utilisateur
├── lib/Service/MenuConfigService.php                 # lecture/écriture de la config + calcul de la config par utilisateur
├── lib/Service/IconService.php                       # stockage des icônes téléversées dans l'appdata
├── lib/Migration/ImportLegacyConfig.php               # reprend la config de l'ancienne app « mobilemenu »
├── lib/Settings/AdminSection.php                     # section « Menu Custom » dans Réglages > Administration
├── lib/Settings/Admin.php                            # page de réglages admin (portée, ordre, masquage global/par groupe)
├── lib/Controller/SettingsController.php             # endpoint AJAX de sauvegarde des réglages (admin uniquement)
├── lib/Controller/IconController.php                 # téléversement (admin) et service des icônes de liens
├── templates/admin.php                               # gabarit de la page de réglages admin
├── css/menu-custom.css                               # styles responsives (cibles tactiles + drawer) et masquage natif
├── css/menu-custom-admin.css                         # styles de la page de réglages admin
├── js/menu-custom.js                                 # hamburger, tiroir, application des règles au menu natif
├── js/menu-custom-admin.js                           # logique de la page de réglages admin
└── img/app.svg                                       # icône de l'app
```

## Prérequis

- Nextcloud **30 à 34** (déclaré dans `appinfo/info.xml`)
- Accès admin/SSH au serveur pour copier l'app dans le dossier `apps/` et l'activer

## Installation

```bash
# 1. Copier le dossier de l'app sur le serveur
scp -r menucustom utilisateur@serveur:/tmp/

# 2. Se connecter et déplacer l'app dans le dossier apps/ de Nextcloud
ssh utilisateur@serveur
sudo mv /tmp/menucustom /var/www/nextcloud/apps/
sudo chown -R www-data:www-data /var/www/nextcloud/apps/menucustom

# 3. Activer l'app
sudo -u www-data php /var/www/nextcloud/occ app:enable menucustom
```

Pour une mise à jour ultérieure, remplacer le dossier puis vider le cache JS/CSS :

```bash
sudo -u www-data php /var/www/nextcloud/occ maintenance:repair --include-expensive
```

### Migration depuis « Mobile Menu » (`mobilemenu`)

L'app s'appelait « Mobile Menu » jusqu'en 1.1.0. Elle a été renommée en « Menu Custom » en 2.0.0, parce qu'elle ne se limite plus au mobile : elle personnalise aussi les raccourcis sur PC. L'identifiant ayant changé, remplacer le dossier ne suffit pas :

```bash
sudo -u www-data php /var/www/nextcloud/occ app:disable mobilemenu
sudo rm -rf /var/www/nextcloud/apps/mobilemenu
sudo cp -r menucustom /var/www/nextcloud/apps/
sudo chown -R www-data:www-data /var/www/nextcloud/apps/menucustom
sudo -u www-data php /var/www/nextcloud/occ app:enable menucustom
```

À l'activation, l'étape de réparation [`ImportLegacyConfig`](menucustom/lib/Migration/ImportLegacyConfig.php) reprend automatiquement la configuration de `mobilemenu` (ordre, masquages globaux et par groupe, portée) : rien à ressaisir. La configuration de l'ancienne app n'est pas supprimée, un retour en arrière reste donc possible.

## Réglages admin

Une section **« Menu Custom »** apparaît dans *Réglages > Administration*. Quatre blocs :

### 1. Où appliquer le masquage

| Option | Effet |
| --- | --- |
| **Partout (mobile, tablette et PC)** *(défaut)* | Les entrées masquées disparaissent du tiroir mobile **et** du menu d'applications natif, quelle que soit la taille d'écran. |
| **Tiroir mobile uniquement** | Le menu natif reste complet ; seul le tiroir de l'app (≤ 1024px) est filtré. |
| **Menu natif uniquement** | Le tiroir reste complet ; seul le menu d'applications de Nextcloud est filtré. |

### 2. Liens personnalisés

Un **lien** est un raccourci vers l'adresse de votre choix — intranet, application métier, page interne de l'instance. Cliquez sur **Ajouter un lien**, puis renseignez :

| Champ | Rôle |
| --- | --- |
| **Nom affiché** | Le libellé dans le menu. |
| **Adresse** | Adresse complète en `http(s)`, ou chemin interne commençant par `/`. Toute autre forme (`javascript:`, par exemple) est refusée à l'enregistrement. |
| **Icône** | L'adresse d'une image, ou un fichier téléversé (SVG, PNG, JPEG, WebP — 256 Kio maximum). Sans icône, le menu affiche l'initiale du nom, comme pour une app qui n'en fournit pas. |
| **Ouvrir dans un nouvel onglet** | Pose `target="_blank"` et `rel="noopener noreferrer"`. |
| **Réservé à ces groupes** | Liste blanche : sans groupe, le lien est visible par tout le monde. |

Le lien est publié dans la navigation de Nextcloud (`INavigationManager`) au démarrage de l'app : il apparaît donc **aussi bien dans le menu d'applications natif que dans le tiroir mobile**, et se range dans le bloc « Ordre et visibilité » ci-dessous exactement comme une application, où un badge « lien » le distingue. Le glisser-déposer, le masquage global et les vues par groupes s'y appliquent sans réglage supplémentaire.

À noter : les groupes d'un lien fonctionnent **à l'inverse** de ceux d'une vue. Le lien est *réservé* aux groupes listés ; la vue *masque* des entrées aux siens. Les deux se cumulent — un lien réservé au groupe « École » peut être masqué à ce même groupe par une vue, auquel cas plus personne ne le voit.

### 3. Ordre et visibilité

Glissez-déposez les entrées (ou utilisez les boutons ↑/↓, accessibles au clavier) pour changer leur ordre, et décochez celles à masquer pour **tout le monde**. L'ordre s'applique au tiroir, et aussi au menu natif quand la portée inclut le PC.

### 4. Vues par groupes

Une **vue** est un jeu de raccourcis à masquer, associé à un ou plusieurs groupes. Plusieurs groupes qui doivent voir la même chose partagent donc **une seule vue**, au lieu d'être configurés à l'identique un par un.

Exemple — « Personnel cantine » et « Personnel scolaire » doivent voir la même chose :

1. Ouvrir *Réglages > Administration > Menu Custom*.
2. Vérifier que la portée est sur « Partout (mobile, tablette et PC) ».
3. Cliquer sur **Ajouter une vue** et la nommer « École ».
4. Dans le champ de recherche, taper `cant`, choisir « Personnel cantine » ; recommencer pour « Personnel scolaire ».
5. Cocher « Deck », « Tâches » et « Notes » dans la liste des entrées à masquer.

Le champ de recherche **interroge le serveur au fil de la frappe** (25 résultats au maximum) : la liste des groupes n'est jamais chargée entièrement dans le navigateur, ce qui reste rapide même avec des milliers de groupes. Il se pilote entièrement au clavier — ↓/↑ pour parcourir les suggestions, Entrée pour ajouter, Échap pour fermer, Retour arrière sur un champ vide pour retirer le dernier groupe.

Chaque vue est repliable, son en-tête résumant son état (« 2 groupes · 3 entrées masquées »). Les modifications sont enregistrées automatiquement (AJAX, court délai anti-rebond) et s'appliquent au prochain chargement de page des utilisateurs concernés.

### Notes importantes

- Le masquage est **uniquement visuel** : une entrée masquée disparaît des menus mais l'app reste accessible si l'utilisateur connaît son URL directe. Pour une **restriction d'accès réelle** par groupe, utilisez la fonctionnalité native *Réglages > Applications > « Limiter aux groupes »* — qui, elle, retire aussi l'entrée de la navigation.
- Un utilisateur cumule le masquage global et celui de **toutes** les vues dont il partage au moins un groupe. Un même groupe peut d'ailleurs figurer dans plusieurs vues — l'écran de réglages le signale dans les suggestions (« déjà dans « X » ») — et les masquages s'additionnent alors.
- L'ordre des entrées est **global** : il n'est pas propre à une vue.
- Un groupe supprimé de Nextcloud reste affiché dans sa vue, signalé en orange : la configuration n'est jamais modifiée dans votre dos.
- Sur les versions de Nextcloud qui affichent une partie des apps dans la barre et le reste dans un menu « … », Nextcloud calcule ce découpage sans connaître les entrées masquées : la barre peut donc paraître moins remplie qu'attendu. Sur Nextcloud 34, où toutes les apps sont dans la grille, la question ne se pose pas.
- Une entrée référencée par la configuration mais absente de la navigation de l'admin (app désactivée, ou limitée à d'autres groupes) reste affichée dans l'écran de réglages avec la mention « app absente » : le réglage est conservé plutôt que perdu.
- La configuration est stockée côté serveur (table `appconfig`, en JSON) via [`MenuConfigService`](menucustom/lib/Service/MenuConfigService.php) ; la configuration effective est calculée par utilisateur en fusionnant les règles globales et celles de ses groupes.
- Un lien personnalisé est un raccourci, **pas un contrôle d'accès** : réserver un lien à un groupe ne protège en rien le site visé, qui reste joignable par son adresse.
- Les icônes téléversées sont stockées dans l'`appdata` de l'instance via [`IconService`](menucustom/lib/Service/IconService.php), et non dans le dossier de l'app, qui est remplacé à chaque mise à jour. Le type réel du fichier est déduit de son contenu, son nom est généré côté serveur, et il est servi avec une politique de sécurité vide (`default-src 'none'`) : un SVG contenant du script ne s'exécute pas, même si son adresse est ouverte directement. Les icônes qu'aucun lien n'utilise plus sont supprimées à l'enregistrement des réglages.

## Vérification

1. Ouvrir Nextcloud dans un navigateur, connecté avec un compte du groupe configuré.
2. **PC** : vérifier que les entrées masquées ont disparu de la barre du haut et de la grille d'applications (bouton en damier), et que les autres comptes les voient toujours.
3. **Mobile/tablette** : passer en mode responsive (DevTools), tester ~375px et ~768px, et vérifier :
   - l'apparition du bouton hamburger dans la barre du haut ;
   - l'ouverture/fermeture fluide du tiroir (clic sur le bouton, sur l'overlay, touche Échap, sélection d'un lien) ;
   - le contenu du tiroir : seules les entrées autorisées, dans l'ordre configuré ;
   - des cibles tactiles visiblement plus grandes.

## Personnalisation

- Le breakpoint mobile/tablette (`1024px`) est défini dans [`menu-custom.js`](menucustom/js/menu-custom.js) (`BREAKPOINT`) et [`menu-custom.css`](menucustom/css/menu-custom.css) (`@media`) — garder les deux synchronisés.
- Si une entrée n'est pas masquée sur un thème très personnalisé, c'est que son conteneur n'est pas reconnu comme un menu d'applications : ajuster `collectNativeRoots()` et le sélecteur de conteneur dans `scanNativeMenus()` ([`menu-custom.js`](menucustom/js/menu-custom.js)). Le garde-fou `MIN_ENTRIES_FOR_MENU` évite de masquer un simple lien vers `/apps/…` placé ailleurs dans l'interface.

## Licence

AGPL (voir `appinfo/info.xml`).
