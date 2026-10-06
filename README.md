# Ma Cave — suivi de cave à vin

Web app (PWA) installable sur l'écran d'accueil du téléphone pour gérer sa cave à vin.

## Fonctionnalités

- **Cave** : bouteilles classées par catégorie (Rouge, Blanc, Rosé, Champagne, Porto, Whiskey, Rhum, Absinthe + catégories personnalisées), recherche, boutons **+ / −** pour ajouter ou retirer une bouteille bue (avec « Annuler »).
- **Ajouter** : fiche avec cuvée, domaine, appellation, cépages, millésime, fenêtre de dégustation, commentaire, et **nombre de bouteilles rentrées** (1, 3, 6, 12 ou libre). Si la même cuvée/millésime existe déjà, les bouteilles sont ajoutées à la fiche existante.
- **📷 Reconnaissance photo** : photographiez l'étiquette, l'IA (Claude) pré-remplit la fiche et estime la fenêtre de dégustation.
- **Maturité** : liste des vins à maturité, triés par urgence (apogée dépassée → à boire rapidement → à maturité).
- **Accords mets & vins** : décrivez le repas, l'IA analyse toutes les fiches et commentaires de votre cave (avec recherche internet si activée) et recommande les bouteilles par ordre de priorité, en privilégiant celles dont la maturité est atteinte.
- **Réglages** : clé API, gestion des catégories, export/import JSON.

Les données sont stockées localement dans le navigateur du téléphone (pensez à exporter une sauvegarde de temps en temps).

## Maturité

Si la fenêtre « À boire de / jusqu'à » est vide, une estimation par défaut est calculée à partir du millésime :
Rouge +3 à +12 ans, Blanc +1 à +6, Rosé +0 à +2, Champagne +2 à +10, Porto +5 à +40, autres vins +2 à +8.
Les spiritueux sont toujours considérés comme prêts. Le bouton **✨ Estimer avec l'IA** donne une estimation plus précise.

## Clé API

La reconnaissance photo et les accords nécessitent une clé API Claude (https://console.anthropic.com/), à saisir dans **Réglages**.
La clé reste sur le téléphone et les requêtes partent directement du navigateur vers l'API Anthropic. Chaque analyse est facturée à l'usage sur votre compte API.

## Mettre en ligne (GitHub Pages)

1. Sur GitHub : **Settings → Pages → Build and deployment → Deploy from a branch**, choisir la branche et le dossier `/ (root)`.
2. Ouvrir l'URL fournie (`https://<utilisateur>.github.io/Suivinasse/`) sur le téléphone.
3. **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».
   **Android (Chrome)** : menu ⋮ → « Ajouter à l'écran d'accueil » / « Installer l'application ».

Pour tester en local : `python3 -m http.server` puis ouvrir http://localhost:8000.

## Structure

- `index.html`, `styles.css`, `app.js` — interface et logique
- `ai.js` — appels à l'API Claude (reconnaissance d'étiquette, estimation d'apogée, accords)
- `vendor/anthropic-sdk.js` — SDK officiel `@anthropic-ai/sdk` embarqué (aucune étape de build)
- `sw.js`, `manifest.webmanifest`, `icons/` — installation et fonctionnement hors ligne
