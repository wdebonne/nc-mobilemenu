<?php

declare(strict_types=1);

return [
	'routes' => [
		[
			'name' => 'settings#save',
			'url' => '/settings',
			'verb' => 'POST',
		],
		[
			'name' => 'settings#searchGroups',
			'url' => '/groups',
			'verb' => 'GET',
		],
		[
			'name' => 'icon#upload',
			'url' => '/icon',
			'verb' => 'POST',
		],
		[
			'name' => 'icon#getIcon',
			'url' => '/icon/{name}',
			'verb' => 'GET',
			// Seuls les noms que le téléversement sait produire : la route ne
			// doit pas servir de point d'entrée pour parcourir l'appdata.
			'requirements' => ['name' => '[a-f0-9]{16}\.(svg|png|jpg|webp)'],
		],
	],
];
