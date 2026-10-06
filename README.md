# Wine in my Cellar — suivi de cave à vin

Web app (PWA) installable sur l'écran d'accueil du téléphone pour gérer sa cave à vin.

## Fonctionnalités

- **Cave** : bouteilles classées par catégorie (Rouge, Blanc, Rosé, Champagne, Porto, Whiskey, Rhum, Absinthe + catégories personnalisées), recherche, boutons **+ / −** pour ajouter ou retirer une bouteille bue (avec « Annuler »).
- **Ajouter** : fiche avec cuvée, domaine, appellation, cépages, millésime, fenêtre de dégustation, commentaire, et **nombre de bouteilles rentrées** (1, 3, 6, 12 ou libre). Si la même cuvée/millésime existe déjà, les bouteilles sont ajoutées à la fiche existante.
- **📷 Reconnaissance photo** : photographiez l'étiquette, l'IA (Gemini ou Claude) pré-remplit la fiche et estime la fenêtre de dégustation.
- **Maturité** : liste des vins à maturité, triés par urgence (apogée dépassée → à boire rapidement → à maturité).
- **Accords mets & vins** : décrivez le repas, l'IA analyse toutes les fiches et commentaires de votre cave (avec recherche internet si activée) et recommande les bouteilles par ordre de priorité, en privilégiant celles dont la maturité est atteinte.
- **Réglages** : moteur IA et clé API, gestion des catégories, export/import JSON.

## Où sont stockées les données ?

| Donnée | Avec comptes (Supabase configuré) | Sans compte |
|---|---|---|
| Cave (fiches, quantités, commentaires, miniatures photo, catégories) | Base de données Supabase, une ligne par compte, protégée par des règles RLS (chaque compte ne lit/écrit que sa cave) + copie locale pour le hors-ligne | Navigateur du téléphone uniquement (`localStorage`) |
| Mot de passe | Géré par Supabase Auth (haché, jamais visible) | — |
| Clé API (Gemini ou Claude) | Navigateur du téléphone uniquement | idem |
| Photos d'étiquette | Envoyées au moteur IA choisi le temps de l'analyse ; seule une miniature 160 px est gardée dans la fiche | idem |

Avec un compte, la cave suit l'utilisateur sur tous ses appareils ; hors ligne, les modifications sont gardées puis envoyées au retour du réseau.

## Comptes (pour partager l'app avec ses amis)

Les comptes reposent sur [Supabase](https://supabase.com) (offre gratuite suffisante). À faire une seule fois :

1. Créer un compte sur supabase.com → **New project** (région Europe, notez le mot de passe de la base).
2. **SQL Editor → New query** : coller le contenu de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → URL Configuration** : mettre l'adresse du site (`https://benhard1.github.io/Suivinasse/`) dans *Site URL* et *Redirect URLs* (pour les liens de confirmation et de mot de passe oublié).
4. *(Optionnel)* **Authentication → Sign In / Providers → Email** : désactiver *Confirm email* pour que les amis puissent se connecter sans valider leur e-mail.
5. **Project Settings → API** : copier *Project URL* et la clé *anon public* dans [`config.js`](config.js).

Tant que `config.js` est vide, l'application fonctionne sans compte (données sur le téléphone). À la première connexion, l'app propose de transférer les bouteilles déjà saisies sur le téléphone vers le compte.

Chaque ami crée son compte depuis l'écran de connexion et a sa propre cave. Pour la photo et les accords, chacun saisit sa propre clé API dans Réglages.

## Maturité

Si la fenêtre « À boire de / jusqu'à » est vide, une estimation par défaut est calculée à partir du millésime :
Rouge +3 à +12 ans, Blanc +1 à +6, Rosé +0 à +2, Champagne +2 à +10, Porto +5 à +40, autres vins +2 à +8.
Les spiritueux sont toujours considérés comme prêts. Le bouton **✨ Estimer avec l'IA** donne une estimation plus précise.

## Moteur IA et clé API

La reconnaissance photo et les accords nécessitent une clé API personnelle, à saisir dans **Réglages → Intelligence artificielle**. Elle reste sur le téléphone ; les requêtes partent directement du navigateur vers le fournisseur choisi.

- **Google Gemini (par défaut, gratuit)** : clé sur https://aistudio.google.com/apikey (compte Google, sans carte bancaire). Quotas journaliers limités mais suffisants pour un usage personnel ; sur l'offre gratuite, Google peut utiliser les données envoyées pour améliorer ses modèles. Modèle `gemini-flash-latest` (repli sur `gemini-2.5-flash`), recherche Google pour les accords.
- **Claude (payant à l'usage)** : clé sur https://console.anthropic.com/ avec du crédit. Modèle `claude-opus-5-5`, recherche web pour les accords. Un abonnement Claude.ai (Pro/Max) ne fournit pas de clé API.

## Mettre en ligne (GitHub Pages)

1. Sur GitHub : **Settings → Pages → Build and deployment → Deploy from a branch**, choisir la branche et le dossier `/ (root)`.
2. Ouvrir l'URL fournie (`https://<utilisateur>.github.io/Suivinasse/`) sur le téléphone.
3. **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».
   **Android (Chrome)** : menu ⋮ → « Ajouter à l'écran d'accueil » / « Installer l'application ».

Pour tester en local : `python3 -m http.server` puis ouvrir http://localhost:8000.

## Structure

- `index.html`, `styles.css`, `app.js` — interface et logique
- `storage.js`, `config.js`, `supabase/schema.sql` — comptes et synchronisation
- `assets/`, `icons/` — logo et icônes
- `ai.js` — appels IA Gemini / Claude (reconnaissance d'étiquette, estimation d'apogée, accords)
- `vendor/` — SDK officiels `@anthropic-ai/sdk` et `@supabase/supabase-js` embarqués (aucune étape de build)
- `sw.js`, `manifest.webmanifest` — installation et fonctionnement hors ligne
