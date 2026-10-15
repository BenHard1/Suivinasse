# Wine in my Cellar — suivi de cave à vin

Web app (PWA) installable sur l'écran d'accueil du téléphone pour gérer sa cave à vin.

## Fonctionnalités

- **Cave** : **barre de recherche** (cuvée, domaine, région, appellation, cépage, millésime ou commentaire ; sans tenir compte des accents ni des majuscules), bouteilles classées par couleur/catégorie (Rouge, Blanc, Rosé, Champagne, Porto, Whiskey, Rhum, Absinthe + catégories personnalisées) puis par région, filtre **Au frais / En carton** (rangement modifiable d'un geste sur chaque fiche), boutons **+ / −** pour ajouter ou retirer une bouteille bue (avec « Annuler »).
- **Ajouter** (bouton **+** en bas à droite de la page Cave) : fiche avec cuvée, domaine, région, appellation, cépages, millésime, fenêtre de dégustation, rangement « au frais », commentaire, et **nombre de bouteilles rentrées** (1, 3, 6, 12 ou libre). Si la même cuvée/millésime existe déjà, les bouteilles sont ajoutées à la fiche existante.
- **Millésimes** : sur la fiche d'une bouteille, les autres millésimes de la même cuvée (même cuvée et domaine) apparaissent en onglets ; « + Millésime » ouvre une nouvelle fiche pré-remplie (catégorie, région, appellation, cépages, rangement) où il suffit d'indiquer l'année et le nombre de bouteilles.
- **Fiche de dégustation** : sur la fiche d'une bouteille, « Générer avec recherche en ligne » demande à l'IA (clé des Réglages) de chercher la cuvée sur internet et de rédiger sa fiche : présentation, robe, nez, bouche, finale, accords, service, potentiel de garde, notes de critiques et sources. Elle est enregistrée avec la fiche ; repli sans recherche si celle-ci est refusée.
- **Photos de la bouteille** : jusqu'à 6 photos en haute définition par fiche (étiquette, contre-étiquette, capsule…), prises à l'appareil ou choisies dans la galerie ; un appui sur la miniature de la cave les affiche en plein écran (glisser pour passer de l'une à l'autre).
- **Reconnaissance photo** : photographiez l'étiquette ou choisissez une photo de la galerie, l'IA (Gemini ou Claude) pré-remplit la fiche et estime la fenêtre de dégustation.
- **Maturité** : liste des vins à maturité, triés par urgence (apogée dépassée → à boire rapidement → à maturité).
- **Accords mets & vins** : décrivez le repas ; des **suggestions immédiates** (sans IA, calculées sur le téléphone à partir de mots-clés du repas, du style de chaque vin et de sa maturité) s'affichent aussitôt, puis **l'avis du sommelier IA** (3 bouteilles maximum, avec explication et service) sur une présélection des 25 bouteilles les plus pertinentes. Recherche internet en option (plus lente), délai maximal pour ne jamais rester bloqué.
- **Cépages & terroirs** : carte de France interactive des régions viticoles ; un appui sur une région affiche ses cépages rouges et blancs, son terroir, ses appellations phares, ses styles et les bouteilles de la cave qui en viennent ; l'interrupteur « Dans ma cave » ne garde en couleur que les régions représentées dans la cave, avec leur nombre de bouteilles.
- **Réglages** : moteur IA et clé API, gestion des catégories, export/import JSON.

## Où sont stockées les données ?

| Donnée | Avec comptes (Supabase configuré) | Sans compte |
|---|---|---|
| Cave (fiches, quantités, commentaires, photos, catégories) | Base de données Supabase, une ligne par compte, protégée par des règles RLS (chaque compte ne lit/écrit que sa cave) + copie locale pour le hors-ligne | Navigateur du téléphone uniquement (`localStorage`) |
| Mot de passe | Géré par Supabase Auth (haché, jamais visible) | — |
| Clé API (Gemini ou Claude) | Dans le compte (métadonnées Supabase Auth, lisibles uniquement par l'utilisateur connecté) — retrouvée sur tous ses appareils, jamais incluse dans les exports | Navigateur du téléphone uniquement |
| Photos de la bouteille | Haute définition (jusqu'à 2560 px) dans Supabase Storage (seau privé `photos`, un dossier par compte) + copie sur l'appareil ; la cave ne garde qu'une miniature | Sur l'appareil uniquement (IndexedDB), envoyées dans le compte à la première connexion |

Avec un compte, la cave suit l'utilisateur sur tous ses appareils ; hors ligne, les modifications sont gardées puis envoyées au retour du réseau.

## Comptes (pour partager l'app avec ses amis)

Les comptes reposent sur [Supabase](https://supabase.com) (offre gratuite suffisante). À faire une seule fois :

1. Créer un compte sur supabase.com → **New project** (région Europe, notez le mot de passe de la base).
2. **SQL Editor → New query** : coller le contenu de [`supabase/schema.sql`](supabase/schema.sql) → **Run** (crée la table des caves et l'espace de stockage des photos ; peut être relancé sans risque).
3. **Authentication → URL Configuration** : mettre l'adresse du site (`https://benhard1.github.io/Suivinasse/`) dans *Site URL* et *Redirect URLs* (pour les liens de confirmation et de mot de passe oublié).
4. *(Optionnel)* **Authentication → Sign In / Providers → Email** : désactiver *Confirm email* pour que les amis puissent se connecter sans valider leur e-mail.
5. **Project Settings → API** : copier *Project URL* et la clé *anon public* dans [`config.js`](config.js).

Tant que `config.js` est vide, l'application fonctionne sans compte (données sur le téléphone). À la première connexion, l'app propose de transférer les bouteilles déjà saisies sur le téléphone vers le compte.

Chaque ami crée son compte depuis l'écran de connexion et a sa propre cave. Pour la photo et les accords, chacun saisit sa propre clé API dans Réglages.

## Maturité

Si la fenêtre « À boire de / jusqu'à » est vide, une estimation par défaut est calculée à partir du millésime :
Rouge +3 à +12 ans, Blanc +1 à +6, Rosé +0 à +2, Champagne +2 à +10, Porto +5 à +40, autres vins +2 à +8.
Les spiritueux sont toujours considérés comme prêts. Le bouton **Estimer avec l'IA** donne une estimation plus précise.

## Moteur IA et clé API

Pendant chaque appel IA, une barre de progression et le **temps restant estimé** s'affichent. L'estimation part d'une valeur par défaut (étiquette ≈ 12 s, fenêtre ≈ 8 s, fiche de dégustation ≈ 45 s, accords ≈ 20 s, ≈ 35 s avec recherche internet) puis s'ajuste à la durée moyenne des derniers appels sur l'appareil, pour chaque moteur.

La reconnaissance photo et les accords nécessitent une clé API personnelle, à saisir une fois dans **Réglages → Intelligence artificielle** (enregistrée dans le compte, ou sur le téléphone sans compte) ; les requêtes partent directement du navigateur vers le fournisseur choisi.

- **Google Gemini (par défaut, gratuit)** : clé sur https://aistudio.google.com/apikey (compte Google, sans carte bancaire). Quotas journaliers limités mais suffisants pour un usage personnel ; sur l'offre gratuite, Google peut utiliser les données envoyées pour améliorer ses modèles. Modèles essayés dans l'ordre : `gemini-3.5-flash`, `gemini-flash-latest`, `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` ; un modèle retiré, surchargé ou au quota épuisé fait passer au suivant, le dernier modèle fonctionnel est mémorisé, et si tous échouent l'app interroge la liste des modèles disponibles pour la clé. Recherche Google pour les accords (repli sans recherche si elle est refusée).
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
- `photos.js` — photos haute définition (IndexedDB + Supabase Storage)
- `assets/`, `icons/` — logo et icônes
- `terroir.js`, `france-map.js` — données des régions viticoles et fond de carte des départements ([svg-maps](https://github.com/VictorCazanave/svg-maps) © Victor Cazanave, CC BY 4.0)
- `pairing.js` — accords rapides sans IA (profils de vins, mots-clés des plats, maturité)
- `ai.js` — appels IA Gemini / Claude (reconnaissance d'étiquette, estimation d'apogée, accords)
- `vendor/` — SDK officiels `@anthropic-ai/sdk` et `@supabase/supabase-js` embarqués (aucune étape de build)
- `sw.js`, `manifest.webmanifest` — installation et fonctionnement hors ligne
