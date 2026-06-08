<?php
declare(strict_types=1);

/** @var \OCP\IL10N $l */
?>
<div id="mobilemenu-admin" class="mobilemenu-admin section">
	<h2><?php p($l->t('Mobile Menu')); ?></h2>
	<p class="settings-hint">
		<?php p($l->t('Personnalisez le tiroir de navigation mobile : ordre des entrées, masquage global et masquage par groupe d\'utilisateurs.')); ?>
	</p>

	<section class="mobilemenu-admin-block" data-block="order">
		<h3><?php p($l->t('Ordre et visibilité')); ?></h3>
		<p class="settings-hint">
			<?php p($l->t('Glissez-déposez les entrées pour changer leur ordre dans le tiroir mobile, et décochez celles à masquer pour tout le monde.')); ?>
		</p>
		<ul class="mobilemenu-admin-order-list" data-role="order-list"></ul>
	</section>

	<section class="mobilemenu-admin-block" data-block="group">
		<h3><?php p($l->t('Masquage par groupe')); ?></h3>
		<p class="settings-hint">
			<?php p($l->t('Choisissez un groupe pour masquer certaines entrées du tiroir mobile uniquement pour ses membres — par exemple, masquer « Deck » pour le groupe « Responsables ».')); ?>
		</p>

		<div class="mobilemenu-admin-group-picker">
			<label for="mobilemenu-admin-group-select"><?php p($l->t('Groupe')); ?></label>
			<select id="mobilemenu-admin-group-select" data-role="group-select"></select>
		</div>

		<ul class="mobilemenu-admin-group-list" data-role="group-list"></ul>
	</section>

	<p class="mobilemenu-admin-status" data-role="status" aria-live="polite"></p>
</div>
