# Page avocat (Manif')

Page statique qui ouvre un original partagé depuis l'app Manif'. Tout est
déchiffré dans le navigateur : la clé est dans le lien, après le « # », et
n'est jamais envoyée au serveur. Le serveur (fonction `share-access`) vérifie
seulement que le lien n'a pas expiré ni été révoqué, puis fournit les segments
chiffrés pour quelques minutes.

- `lib.js` : déchiffrement (AES-256-GCM, WebCrypto), empreintes SHA-256.
- `app.js` : interface.
- `config.js` : adresse de la fonction `share-access` du projet.
- Tests : `node test.mjs` (vecteurs partagés avec le noyau `manif_crypto`).

Aucun script externe, aucun traceur, aucun cookie (politique de sécurité du
contenu dans `index.html`). Licence Apache 2.0.
