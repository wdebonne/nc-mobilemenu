/**
 * Mobile Menu — page de configuration admin : restrictions par groupe.
 */
(function () {
	'use strict';

	var container = document.getElementById('mobilemenu-admin-settings');
	if (!container) return;

	var data;
	try {
		data = JSON.parse(container.getAttribute('data-config') || '{}');
	} catch (e) {
		return;
	}

	var groups = data.groups || [];
	var apps   = data.apps   || [];

	// État courant (mutable au fil des interactions)
	var current = {};
	groups.forEach(function (g) {
		current[g.id] = ((data.restrictions || {})[g.id] || []).slice();
	});

	function t(text) {
		if (typeof window.t === 'function') {
			try { return window.t('mobilemenu', text); } catch (e) {}
		}
		return text;
	}

	function updateBadge(summary, groupId) {
		var count = (current[groupId] || []).length;
		var badge = summary.querySelector('.mobilemenu-admin-badge');
		if (count > 0) {
			if (!badge) {
				badge = document.createElement('span');
				badge.className = 'mobilemenu-admin-badge';
				summary.appendChild(badge);
			}
			badge.textContent = count;
		} else if (badge) {
			badge.parentNode.removeChild(badge);
		}
	}

	function render() {
		container.innerHTML = '';

		if (!groups.length) {
			var msg = document.createElement('p');
			msg.textContent = t('Aucun groupe trouvé.');
			container.appendChild(msg);
			return;
		}

		var desc = document.createElement('p');
		desc.className   = 'mobilemenu-admin-desc';
		desc.textContent = t('Cochez les applications à masquer dans le menu mobile pour chaque groupe.');
		container.appendChild(desc);

		groups.forEach(function (group) {
			var details = document.createElement('details');
			details.className = 'mobilemenu-admin-group';

			var summary = document.createElement('summary');
			summary.textContent = group.name;
			updateBadge(summary, group.id);
			details.appendChild(summary);

			if (!apps.length) {
				var noApps = document.createElement('p');
				noApps.className   = 'mobilemenu-admin-noapps';
				noApps.textContent = t('Aucune application installée.');
				details.appendChild(noApps);
				container.appendChild(details);
				return;
			}

			var list = document.createElement('ul');
			list.className = 'mobilemenu-admin-applist';

			apps.forEach(function (app) {
				var li    = document.createElement('li');
				var label = document.createElement('label');
				var cb    = document.createElement('input');

				cb.type    = 'checkbox';
				cb.value   = app.id;
				cb.checked = (current[group.id] || []).indexOf(app.id) !== -1;

				cb.addEventListener('change', function () {
					var arr = current[group.id] || [];
					if (cb.checked) {
						if (arr.indexOf(app.id) === -1) arr.push(app.id);
					} else {
						arr = arr.filter(function (id) { return id !== app.id; });
					}
					current[group.id] = arr;
					updateBadge(summary, group.id);
				});

				label.appendChild(cb);
				label.appendChild(document.createTextNode(' ' + app.name));
				li.appendChild(label);
				list.appendChild(li);
			});

			details.appendChild(list);
			container.appendChild(details);
		});

		var footer = document.createElement('div');
		footer.className = 'mobilemenu-admin-footer';

		var saveBtn = document.createElement('button');
		saveBtn.type        = 'button';
		saveBtn.className   = 'button primary';
		saveBtn.textContent = t('Enregistrer');
		saveBtn.addEventListener('click', save);
		footer.appendChild(saveBtn);

		var status = document.createElement('span');
		status.id        = 'mobilemenu-admin-status';
		status.className = 'mobilemenu-admin-status';
		footer.appendChild(status);

		container.appendChild(footer);
	}

	function save() {
		var btn    = container.querySelector('.button.primary');
		var status = document.getElementById('mobilemenu-admin-status');

		btn.disabled    = true;
		btn.textContent = t('Enregistrement…');
		status.textContent = '';
		status.className   = 'mobilemenu-admin-status';

		var token = (window.OC && window.OC.requestToken) ? window.OC.requestToken : '';
		var url   = (window.OC && window.OC.generateUrl)
			? window.OC.generateUrl('/apps/mobilemenu/admin/settings')
			: '/apps/mobilemenu/admin/settings';

		fetch(url, {
			method:  'POST',
			headers: {
				'Content-Type': 'application/json',
				'requesttoken': token,
			},
			body: JSON.stringify({ restrictions: current }),
		})
			.then(function (r) { return r.json(); })
			.then(function (result) {
				btn.disabled    = false;
				btn.textContent = t('Enregistrer');
				if (result.status === 'success') {
					status.textContent = t('Paramètres enregistrés.');
					status.className   = 'mobilemenu-admin-status success';
				} else {
					status.textContent = t('Erreur lors de l\'enregistrement.');
					status.className   = 'mobilemenu-admin-status error';
				}
				setTimeout(function () { status.textContent = ''; }, 3000);
			})
			.catch(function () {
				btn.disabled    = false;
				btn.textContent = t('Enregistrer');
				status.textContent = t('Erreur réseau.');
				status.className   = 'mobilemenu-admin-status error';
			});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', render);
	} else {
		render();
	}
})();
