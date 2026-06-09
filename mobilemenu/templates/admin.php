<?php
/** @var array $_ */
\OCP\Util::addScript('mobilemenu', 'admin');
\OCP\Util::addStyle('mobilemenu', 'admin');
?>
<div id="mobilemenu-admin-settings"
	 data-config="<?php p($_['adminData']); ?>">
</div>
