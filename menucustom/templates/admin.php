<?php
declare(strict_types=1);

/** @var \OCP\IL10N $l */
?>
<div id="menucustom-admin" class="menucustom-admin section">
	<h2><?php p($l->t('Menu Custom')); ?></h2>
	<p class="settings-hint">
		<?php p($l->t('Personnalisez les raccourcis d\'applications : ordre des entrées, masquage global, vues partagées par plusieurs groupes, et portée du masquage (mobile, tablette et/ou PC).')); ?>
	</p>

	<section class="menucustom-admin-block" data-block="scope">
		<h3><?php p($l->t('Où appliquer le masquage')); ?></h3>
		<p class="settings-hint">
			<?php p($l->t('Choisissez si les entrées masquées disparaissent uniquement du tiroir mobile de cette app, uniquement du menu d\'applications natif de Nextcloud, ou des deux.')); ?>
		</p>

		<ul class="menucustom-admin-scope-list" data-role="scope-list">
			<li>
				<label>
					<input type="radio" name="menucustom-scope" value="all">
					<span>
						<strong><?php p($l->t('Partout (mobile, tablette et PC)')); ?></strong>
						<small><?php p($l->t('Les entrées masquées disparaissent du tiroir mobile et du menu d\'applications natif, quelle que soit la taille d\'écran.')); ?></small>
					</span>
				</label>
			</li>
			<li>
				<label>
					<input type="radio" name="menucustom-scope" value="mobile">
					<span>
						<strong><?php p($l->t('Tiroir mobile uniquement')); ?></strong>
						<small><?php p($l->t('Le menu natif de Nextcloud reste complet ; seul le tiroir de cette app (≤ 1024px) est filtré.')); ?></small>
					</span>
				</label>
			</li>
			<li>
				<label>
					<input type="radio" name="menucustom-scope" value="desktop">
					<span>
						<strong><?php p($l->t('Menu natif uniquement')); ?></strong>
						<small><?php p($l->t('Le tiroir de cette app reste complet ; seul le menu d\'applications de Nextcloud est filtré.')); ?></small>
					</span>
				</label>
			</li>
		</ul>
	</section>

	<section class="menucustom-admin-block" data-block="links">
		<h3><?php p($l->t('Liens personnalisés')); ?></h3>
		<p class="settings-hint">
			<?php p($l->t('Ajoutez un raccourci vers un site interne ou externe. Il apparaît dans le menu de Nextcloud comme une application, et se range comme les autres dans le bloc « Ordre et visibilité » ci-dessous.')); ?>
		</p>

		<div class="menucustom-admin-links" data-role="links"></div>

		<button type="button" class="menucustom-admin-add-view" data-role="add-link">
			<?php p($l->t('Ajouter un lien')); ?>
		</button>
	</section>

	<section class="menucustom-admin-block" data-block="order">
		<h3><?php p($l->t('Ordre et visibilité')); ?></h3>
		<p class="settings-hint">
			<?php p($l->t('Glissez-déposez les entrées pour changer leur ordre, et décochez celles à masquer pour tout le monde.')); ?>
		</p>
		<ul class="menucustom-admin-order-list" data-role="order-list"></ul>
	</section>

	<section class="menucustom-admin-block" data-block="views">
		<h3><?php p($l->t('Vues par groupes')); ?></h3>
		<p class="settings-hint">
			<?php p($l->t('Une vue est un jeu de raccourcis à masquer, associé à un ou plusieurs groupes. Plusieurs groupes qui doivent voir la même chose partagent donc une seule vue — par exemple « Personnel cantine » et « Personnel scolaire » dans une vue « École », sans avoir à la configurer deux fois.')); ?>
		</p>

		<div class="menucustom-admin-views" data-role="views"></div>

		<button type="button" class="menucustom-admin-add-view" data-role="add-view">
			<?php p($l->t('Ajouter une vue')); ?>
		</button>
	</section>

	<p class="menucustom-admin-note settings-hint">
		<?php p($l->t('Le masquage est visuel : une entrée masquée disparaît des menus, mais l\'app reste accessible par son URL directe. Pour une restriction d\'accès réelle, utilisez « Réglages > Applications > Limiter aux groupes ».')); ?>
	</p>

	<p class="menucustom-admin-status" data-role="status" aria-live="polite"></p>
</div>
