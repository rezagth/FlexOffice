# MakomSpace – prototype cliquable

- `makomspace-site.html` : prototype assemblé (ouvrir dans un navigateur).
- `mk-src/` : sources (a-head.html, b-data.js, c-views.js, d-host.js, f-home.js, e-app.js).
- `artefacts/` : benchmark Airbnb/Booking et écarts MakomSpace.

Reconstruire (bash) :
cd mk-src && cat b-data.js c-views.js d-host.js f-home.js e-app.js > /tmp/all.js && node --check /tmp/all.js && (cat a-head.html; echo '<script>'; cat /tmp/all.js; echo '</script>') > ../makomspace-site.html
