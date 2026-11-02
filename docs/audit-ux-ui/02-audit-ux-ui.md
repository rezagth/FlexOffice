# 02 — Audit UX/UI MakomSpace

Date : 20 octobre 2026. Phase B (voir l'app) et phase C (audit). Aucune modification de `src/`, `prisma/`, des migrations ni de la configuration.

## 0. Méthode, périmètre et limites

**Ce qui a été vu à l'écran.** L'application a été lancée en local à partir d'une **copie** du dépôt (hors du dossier du projet), avec un Postgres local, un faux serveur d'authentification et trois comptes de test : un locataire, un bailleur (organisation vérifiée), un administrateur. Aucun fichier `.env*` n'a été lu, aucune connexion à la production ou au Supabase du projet. Les captures sont dans `docs/audit-ux-ui/captures/` (à ne pas commiter, le dossier n'est pas dans `.gitignore`).

**Captures** à 390, 768 et 1440 px : 12 pages publiques (états vide et avec résultats de la recherche, 404 compris), la fiche espace (visiteur et connecté), le tunnel de réservation (état initial, créneau choisi, erreur de validation), 9 écrans locataire dont la messagerie et les factures, 15 écrans bailleur, 9 écrans admin, 2 e-mails transactionnels rendus avec les vrais modèles du dépôt. Une trentaine ont été regardées une par une ; les autres ont été contrôlées par les mesures automatiques et le code.

**Limites à connaître**
1. Les données de test sont **fictives et locales**. Les photos d'espaces sont les illustrations vectorielles du dépôt (`public/images/demo/*.svg`). La note « photographie » juge donc l'interface et le parti pris du code, pas les vraies photos des bailleurs, qui n'existent pas encore.
2. Le faux serveur d'authentification ne reproduit pas : e-mails de confirmation et de réinitialisation, OAuth, téléversement de photos (pas de Storage), iframe Stripe. Le tunnel s'arrête avant le paiement carte ; l'état « téléversement de photos » n'a pas pu être vu en réel.
3. Les valeurs de performance sont des **mesures de laboratoire** sur `localhost`, sans CDN. Elles servent à comparer avant/après, pas à prédire la production.
4. L'état de chargement (`loading.tsx`) et la page d'erreur globale n'ont pas été capturés en image : analysés dans le code seulement (`src/components/dashboard/states.tsx`, `src/app/error.tsx`).
5. Les saisies de date et d'heure affichent des formats américains (`mm/dd/yyyy`, `09:00 AM`) dans les captures : c'est très probablement le navigateur de test (Chromium sans locale système). Je ne les compte pas comme défaut, sauf la **troncature** des champs d'heure, visible quelle que soit la locale.
6. Les notes de 0 à 10 sont un **jugement d'auditeur** appuyé sur les captures, le code et les mesures. Elles servent à ordonner les priorités ; elles ne sont pas un instrument de mesure.
7. Les documents du projet Claude « FlexOffice » n'ont pas pu être consultés (voir le dossier d'inspiration, section 0).

## 1. Note globale : 4,9 / 10

Une application **propre, accessible et honnête, mais générique**. Aucune faute grave de lisibilité, aucun faux avis, aucune promesse inventée. Mais rien ne dit « Airbnb pour espaces pro », et la photo, qui devrait porter tout le produit, est absente.

### Ce qui est solide (à ne pas casser)

- **Accessibilité** : axe (WCAG 2.0/2.1 A et AA) ne remonte aucune violation sur 49 des 50 états de page testés au bureau ; Lighthouse accessibilité = 100 sur les 5 pages publiques. Seul le calendrier bailleur échoue (finding F-24). Lien d'évitement, anneau de focus dont le contraste est calculé (`src/app/globals.css`).
- **Honnêteté du contenu** : la carte d'espace n'affiche une note que si elle est réelle (`src/components/marketing/space-card.tsx`, commentaire de tête), la fiche dit « Pas encore d'avis sur cet espace ». Les badges de confiance ont été réécrits pour ne promettre que ce que la plateforme fait (`src/components/marketing/trust-badges.tsx`).
- **Marque et performance de base** : logo « M » à porte dorée inline en SVG, polices locales (`src/app/fonts.ts`), décalage de mise en page nul (CLS 0) sauf la recherche (0,06 à 0,09).
- **Parcours bailleur** : la liste « Premiers pas » (8 étapes, barre de progression, bouton d'action par étape) est une bonne idée, bien exécutée.
- **États vides** : tous ont un titre, une explication et, quand c'est possible, une action de sortie.

### Notes par écran et par critère

| Écran | Captures | Hiérarchie | Espace/rythme | Typographie | Couleur | Photographie | Cohérence comp. | Clarté parcours | Confiance | Mobile | Accessibilité | Micro-interactions | Fait main | Moy. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Accueil | 01-accueil | 6 | 5 | 5 | 6 | 2 | 6 | 6 | 6 | 6 | 8 | 4 | 3 | 5.2 |
| Recherche | 02-recherche, 02c | 5 | 5 | 5 | 5 | 2 | 6 | 5 | 5 | 5 | 8 | 3 | 4 | 4.8 |
| Fiche espace | 11, 11b | 5 | 5 | 5 | 5 | 1 | 6 | 4 | 6 | 4 | 8 | 3 | 4 | 4.7 |
| Tunnel de réservation | 12, 12d, 12e | 6 | 6 | 5 | 6 | 1 | 6 | 6 | 6 | 6 | 7 | 4 | 5 | 5.3 |
| Espace locataire | 20 à 26 | 5 | 5 | 5 | 6 | 1 | 6 | 5 | 5 | 5 | 8 | 3 | 4 | 4.8 |
| Messagerie | 22, 22b | 4 | 5 | 5 | 5 | 1 | 5 | 5 | 5 | 6 | 8 | 3 | 4 | 4.7 |
| Bailleur : premiers pas et accueil | 30 | 6 | 6 | 5 | 6 | 1 | 6 | 6 | 6 | 5 | 8 | 4 | 5 | 5.3 |
| Bailleur : espaces, photos, formulaire | 32, 33 | 4 | 5 | 5 | 6 | 1 | 5 | 4 | 5 | 4 | 8 | 3 | 4 | 4.5 |
| Bailleur : calendrier | 35 | 4 | 4 | 5 | 5 | 1 | 5 | 5 | 5 | 3 | 5 | 3 | 4 | 4.1 |
| Bailleur : demandes, revenus, versements | 31, 36, 38 | 5 | 5 | 5 | 6 | 1 | 6 | 6 | 6 | 5 | 8 | 4 | 5 | 5.2 |
| Admin | 50 à 58 | 5 | 5 | 5 | 6 | 1 | 6 | 6 | 6 | 4 | 8 | 3 | 5 | 5.0 |
| Pages éditoriales | 03 à 06 | 5 | 5 | 5 | 6 | 1 | 5 | 6 | 5 | 6 | 8 | 3 | 2 | 4.8 |
| Connexion et inscription | 08, 09 | 5 | 6 | 5 | 6 | 1 | 6 | 7 | 5 | 6 | 8 | 4 | 4 | 5.2 |
| E-mails transactionnels | 60 | 5 | 6 | 4 | 5 | 1 | 5 | 7 | 5 | 6 | 6 | 2 | 5 | 4.8 |
| 404, états vides, erreurs | 10, 02c, 24, 41 | 6 | 6 | 5 | 6 | 1 | 6 | 6 | 6 | 6 | 8 | 3 | 4 | 5.2 |
| **Moyenne par critère** | | 5.1 | 5.3 | 4.9 | 5.7 | 1.1 | 5.7 | 5.6 | 5.5 | 5.1 | 7.6 | 3.3 | 4.1 | **4.9** |


Lecture : l'accessibilité (7,6) est le seul point fort. La photographie (1,1) et les micro-interactions (3,3) tirent la note vers le bas, suivies du « fait main » (4,1).

## 2. Mesures

### Lighthouse (mobile, simulation de réseau et de processeur par défaut, build de production local)

| Page | Perf. | Access. | Bonnes prat. | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Accueil `/` | 85 | 100 | 100 | 100 | 4,4 s | 0 | 10 ms |
| Recherche `/search?city=Paris` | 89 | 100 | 100 | 100 | 3,8 s | 0 | 0 ms |
| Fiche `/spaces/salle-rivoli-paris` | 87 | 100 | 100 | 100 | 4,1 s | 0 | 10 ms |
| Connexion `/login` | 93 | 100 | 96 | 100 | 3,2 s | 0 | 0 ms |
| Proposer un espace | 94 | 100 | 100 | 100 | 3,2 s | 0 | 0 ms |

Les LCP de 3,2 à 4,4 s sont au-dessus de l'objectif de 2,5 s et de l'exigence produit « chargement inférieur à 2 s » (`officeflex-context`, §11). L'élément le plus grand est l'illustration du hero sur l'accueil ; l'origine exacte sur les autres pages n'a pas été isolée (non vérifié).

### CLS et LCP en conditions réelles de navigateur (sans limitation)

CLS : 0 partout, sauf recherche 768 px = 0,087 et 1440 px = 0,058 (tuiles de carte qui arrivent, hypothèse non vérifiée). LCP de la recherche à 390 px : 4,7 s (non limité, local), le seul écart marquant. Fichier brut : `captures/report.json`.

### axe

0 violation sur 49 des 50 états de page testés au bureau (1440 px). Une violation : `color-contrast`, gravité « serious », 22 nœuds, sur le calendrier bailleur (`/app/landlord/calendar`). Les pages dynamiques profondes (détail de vérification, relevés) n'ont pas toutes été parcourues. Débordement horizontal détecté : calendrier à 390 px, listes admin « Annonces » et « Utilisateurs » à 768 px.

### Une anomalie non expliquée

La page bailleur « Versements » (`/app/landlord/payouts`) ne retombe jamais au repos réseau (pas de « networkidle » après 30 s) alors que le contenu s'affiche en 35 ms. Je n'ai pas trouvé la cause dans le code de la page ; à investiguer (F-36).

## 3. Checklist « signes d'IA » par écran

Légende : ● présent, ○ absent. Détail des preuves dans les findings.

| Signe | Accueil | Recherche | Fiche | Tunnel | Connectés | Éditorial | E-mail |
|---|---|---|---|---|---|---|---|
| Dégradé violet/bleu ou texte en dégradé | ○ (dégradé marine sur photo seulement) | ○ | ○ | ○ | ○ | ○ | ○ |
| Verre dépoli (`backdrop-blur`) | ● en-tête et badge de carte | ● en-tête | ● en-tête | ○ | ○ | ○ | ○ |
| shadcn par défaut peu personnalisé | ● Card/Button/Badge | ● | ● | ● | ● | ● | ○ |
| Tout en `rounded-2xl` + même ombre | ● | ● | ● | ● | ● | ● | ○ |
| Hero centré avec pastille/étiquette | ● | ○ | ○ | ○ | ○ | ● | ○ |
| Trois cartes à icône en cercle coloré | ● (4 cartes) | ○ | ○ | ○ | ○ | ● | ○ |
| Emojis | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Mêmes icônes en pastilles partout | ● | ○ | ○ | ○ | ○ | ● | ○ |
| Sections symétriques | ● | ○ | ○ | ○ | ○ | ● | ○ |
| Vocabulaire creux | ● | ○ | ○ | ○ | ○ | ● | ○ |
| Faux chiffres ou témoignages | ○ | ○ | ○ | ○ | ● admin : KPI trompeurs (F-28) | ○ | ○ |
| Photos de banque d'images | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Placeholders « Photo à venir » | ○ | ● dans le code, `space-card.tsx:90` | ● variante | ○ | ● listes bailleur sans vignette | ○ | ○ |
| Animations identiques | ● survol `y:-4` sur chaque carte | ● | ○ | ○ | ○ | ○ | ○ |
| Une seule graisse | ● 310 `font-medium` pour 122 `font-semibold` | ● | ● | ● | ● | ● | ○ |
| États vides génériques | ○ | ● | ○ | ○ | ● (texte seul) | ○ | ○ |

Comptages dans `src/` : `rounded-2xl` 25, `rounded-xl` 18, `rounded-lg` 53, `rounded-full` 52 ; `uppercase` 69 occurrences ; `font-medium` 310, `font-semibold` 122, `font-normal` 4, `font-bold` 1 ; aucun emoji ; un seul dégradé (`hero.tsx:28`).

## 4. Constats

Format : **écran**, captures, problème, pourquoi, correctif, référence, fichiers, sévérité (P0 bloque la promesse produit ou la confiance, P1 dégrade fortement, P2 dégrade, P3 finition), effort (S moins d'un jour, M un à trois jours, L plus de trois jours).

### Identité, photographie, système visuel

**F-01 — Aucune photographie réelle : des illustrations vectorielles tiennent lieu de photos.** P0, L
- Écrans : accueil, recherche, fiche, tunnel. Captures `01-accueil-1440`, `02b-recherche-ville-1440`, `11-fiche-espace-1440`.
- Problème : le hero est une illustration SVG sous un dégradé marine (`src/components/marketing/hero.tsx:17-30`), les deux sections « problème » sont des illustrations, et les cartes d'espace affichent des SVG du dépôt. Quand un espace n'a pas de photo, la carte écrit « Photo à venir » (`src/components/marketing/space-card.tsx:90`).
- Pourquoi : le produit vend de la confiance entre entreprises et la fiche est « l'écran le plus déterminant » (`officeflex-context` §7.2). Airbnb montre la photo avant tout (dossier d'inspiration P1, P3). Sans photo réelle, le site ressemble à une maquette.
- Correctif : photo réelle d'abord (lot 5 : séance chez 3 à 5 bailleurs). Hero sur photo réelle d'un espace partenaire, en recadrage horizontal. Règle produit : un espace sans photo suffisante n'est pas publiable, ou sa carte affiche un cadre neutre sans texte promotionnel. Supprimer les SVG des sections.
- Référence : https://www.airbnb.fr/s/Lyon--France/homes (carte sans bordure, photo pleine). Baymard sur les galeries : https://baymard.com/product-page/benchmark/page-designs/image-gallery-overlay
- Fichiers : `src/components/marketing/hero.tsx`, `problem-section.tsx`, `space-card.tsx`, `public/images/*.svg`, `src/server/domains/spaces/mock-data.ts`.

**F-02 — Kit de cartes uniforme : même rayon, même bordure, même ombre partout.** P1, M
- Captures : toutes. Exemple `20-locataire-accueil-1440`, `32-bailleur-espaces-1440`.
- Problème : `Card` impose `rounded-2xl border shadow-sm` à tout (`src/components/ui/card.tsx:17`). Les écrans connectés sont des piles de cartes pilules, sans variation de niveau entre une liste, un indicateur et un formulaire. Bouton `rounded-full` partout (`src/components/ui/button.tsx`).
- Pourquoi : c'est le signe « kit de cartes » le plus cité (https://capitalandcompute.net/blog/fix-ai-slop-design/). Aucune hiérarchie : tout a le même poids.
- Correctif : trois rayons (8, 16, pilule), deux niveaux d'élévation, listes en lignes séparées par des filets plutôt qu'en cartes empilées, cartes réservées aux objets (un espace, une réservation).
- Fichiers : `src/components/ui/card.tsx`, `button.tsx`, `src/app/globals.css` (jetons `--radius-*`).

**F-03 — Étiquettes en capitales espacées au-dessus de tout.** P1, S
- Captures : `30-bailleur-accueil-1440`, `50-admin-dashboard-1440`, `20-locataire-accueil-1440`.
- Problème : 69 occurrences de `uppercase` (`tracking-wide`) : étiquettes d'indicateurs, de colonnes, de sections (« MODE », « RÉSERVATIONS », « BACK-OFFICE ADMIN », « ERREUR 404 », « POUR LES ENTREPRISES »).
- Pourquoi : habillage de gabarit (https://capitalandcompute.net/blog/fix-ai-slop-design/, tell 12). Les capitales ralentissent la lecture de libellés qui sont des phrases.
- Correctif : libellés en casse normale, 13 px, gris ardoise ; capitales réservées aux en-têtes de colonnes de tableaux.
- Fichiers : `src/components/dashboard/landlord-home.tsx`, `tenant-home.tsx`, `src/app/admin/dashboard/page.tsx`, `src/components/ui/table.tsx`, `src/components/ui/sidebar-nav.tsx`, et le reste (grep `uppercase`).

**F-04 — Typographie : espaces entre mots trop serrés, une seule graisse, pas d'échelle.** P2, S
- Captures : `01-accueil-1440` (« Recevez vos clients »), `12-tunnel-reservation-1440` (« Choisissez une date »).
- Problème : Plus Jakarta Sans 600/700 sur tous les titres (`src/app/globals.css:217-224`) avec un espace entre mots visuellement collé ; presque tout le texte est en graisse 500 (310 occurrences) ; pas d'échelle de tailles, des `text-2xl`, `text-xl`, `text-base` posés au cas par cas ; chiffres non tabulaires dans les montants.
- Pourquoi : la hiérarchie vient surtout de la taille ; sans contraste de graisse, tout se ressemble.
- Correctif : échelle de 6 tailles, corps 400, libellés 500, titres 600 ; `font-variant-numeric: tabular-nums` sur prix et tableaux ; ajuster `word-spacing` si le défaut persiste après essai sur les vraies polices.
- Fichiers : `src/app/globals.css`, `src/app/fonts.ts`.

**F-05 — Pastilles d'icônes et trio de cartes.** P1, M
- Captures : `01-accueil-1440` (« La garantie MakomSpace »), `04-proposer-un-espace-1440`, `03-comment-ca-marche-1440`, `06-a-propos-1440`.
- Problème : quatre cartes à icône en cercle marine ou or sur l'accueil (`src/components/marketing/trust-badges.tsx:66`), même motif en liste (`how-it-works.tsx:36-43`) et sur les pages éditoriales (`proposer-un-espace/page.tsx:78`, `comment-ca-marche/page.tsx:122`, `a-propos/page.tsx:78`).
- Pourquoi : c'est le motif « trois cartes à icône » décrit comme défaut dans https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
- Correctif : icônes de trait sans cercle, ou pas d'icône ; la preuve de confiance prend la forme d'un bloc vérifiable (exemple de fiche « Entreprise vérifiée » avec ce qui est contrôlé) plutôt que quatre slogans.
- Fichiers : les cinq fichiers ci-dessus.

**F-06 — Accueil : structure générique et sections symétriques.** P1, M
- Capture : `01-accueil-1440`, `01-accueil-390`.
- Problème : hero centré, comparatif « café / bureau » en deux cartes avec croix et coches rouges et or (`problem-section.tsx`), « Espaces à la une » = deux cartes dans une grille de trois colonnes qui laisse un vide, « Comment ça marche » en deux colonnes symétriques, puis garantie en quatre cartes. Le tout est correct mais prévisible.
- Pourquoi : ordre de page standard (https://capitalandcompute.net/blog/fix-ai-slop-design/, tell 3). Les cartes de preuve ne montrent pas le produit.
- Correctif : voir la maquette (`maquette.html`) : recherche en pilule, rangée d'espaces réels, un seul bloc de preuve vérifiable, un bloc bailleur sur fond sombre.
- Fichiers : `src/app/(marketing)/page.tsx`, `hero.tsx`, `problem-section.tsx`, `how-it-works.tsx`, `trust-badges.tsx`.

**F-07 — Vocabulaire creux dans quelques titres et sous-titres.** P2, S
- Exemples : « Réservez en toute sérénité grâce à nos standards de qualité élevés » (`trust-badges.tsx`), « Précision MakomSpace » (étiquette, `problem-section.tsx`), « La garantie MakomSpace ».
- Pourquoi : promesse sans contenu (tell 7). Le reste de la copie est plus précis (« Chaque espace est vérifié (SIRET, e-mail professionnel, adresse) avant publication »).
- Correctif : retirer les phrases d'ambiance ; garder les faits. Réécriture dans le lot 5.

### Recherche

**F-08 — La recherche est un formulaire de huit champs, pas une barre.** P1, M
- Captures : `02b-recherche-ville-1440`, `02b-recherche-ville-390`.
- Problème : après le hero (une barre correcte), la page de recherche affiche un cadre blanc avec ville, date, type, prix maximum, tri, dix équipements en cases, « Autour de moi », « Effacer », « Rechercher » (`src/app/search/page.tsx`). Sur mobile, le formulaire fait environ 1 100 px avant le premier résultat.
- Pourquoi : Airbnb garde la recherche dans une pilule compacte et expose des filtres fréquents en pastilles (dossier P5, P6, observé le 20/10/2026).
- Correctif : pilule compacte à trois segments, rangée de pastilles (type, capacité, équipements les plus demandés), panneau « Filtres » pour le reste ; l'état « Autour de moi » devient une pastille.
- Fichiers : `src/app/search/page.tsx`, `src/components/marketing/space-type-filter.tsx`, `hero-search.tsx`, `search-geolocation.tsx`.

**F-09 — La carte est au-dessus des résultats, et elle repousse la liste.** P1, M
- Captures : `02b-recherche-ville-1440` (carte de 320 px de haut avant les cartes), `02b-recherche-ville-390`.
- Problème : liste sous la carte, pas de mise en page liste + carte côte à côte, fond de carte OpenStreetMap standard très coloré qui entre en conflit avec la charte. Pas de lien entre carte et cartes (survol, épingle active).
- Correctif : bureau en deux colonnes (liste à gauche, carte collante à droite) ; mobile : liste par défaut avec bouton « Carte » flottant. Fond de carte désaturé.
- Fichiers : `src/app/search/page.tsx`, `src/components/marketing/search-map.tsx`, `search-map-loader.tsx`.

**F-10 — Carte d'espace : photo trop basse, informations pauvres, faux lien « Détails ».** P2, S
- Captures : `02b-recherche-ville-1440`.
- Problème : photo de 160 px de haut (`space-card.tsx:76`, `h-40`), sans rapport fixe ; pas de carrousel ; prix « / jour » seul alors que la demi-journée existe ; un mot « Détails » décoratif (`aria-hidden`) ; étiquette de type en capitales.
- Pourquoi : la carte Airbnb montre une photo au rapport 4:3, un prix qui correspond à la recherche, une note si elle existe, un cœur.
- Correctif : photo 4:3, rayon 16, titre + ligne ville/capacité, prix « à partir de X € la demi-journée », badge « Entreprise vérifiée » conservé ; supprimer « Détails ».
- Fichiers : `src/components/marketing/space-card.tsx`, `search-results-grid.tsx`.

**F-11 — État « Aucun espace trouvé » correct mais froid.** P3, S
- Capture : `02c-recherche-vide-1440`. Le message propose bien une sortie (« Effacer les filtres »). Titre répété deux fois (« Aucun espace trouvé » au-dessus et dans la carte). Ajouter une action utile : « Proposer cet espace » ou « Être prévenu(e) » seraient des fonctions nouvelles, hors périmètre design ; se limiter à supprimer le doublon et à proposer des villes qui ont des espaces.
- Fichiers : `src/app/search/page.tsx`, `src/components/dashboard/states.tsx`.

### Fiche espace

**F-12 — Galerie : carrousel d'une photo, aucune mosaïque, aucune visite plein écran.** P0, M
- Captures : `11-fiche-espace-1440`, `11b-fiche-espace-connecte-390`.
- Problème : `PhotoCarousel` (`src/components/marketing/photo-carousel.tsx`) affiche une photo à la fois dans un cadre de 384 px de haut, avec flèches ; pas de grille, pas de bouton « Toutes les photos », pas de légende par zone, pas de visite plein écran. Avec une seule photo, c'est un grand rectangle presque vide.
- Pourquoi : la fiche est le moment de décision. Airbnb : mosaïque 1 + 4 (560 × 476 et quatre vignettes 272 px), bouton « Afficher toutes les photos », visite plein écran légendée par pièce (dossier P3).
- Correctif : mosaïque (grande image + 4), bouton avec le nombre de photos, visite plein écran navigable au clavier, légendes. Mobile : carrousel plein largeur avec compteur « 1 / n ». Dégradation propre à 1 et 2 photos.
- Fichiers : `photo-carousel.tsx`, `src/app/spaces/[slug]/page.tsx`, `src/components/ui/carousel.tsx`.

**F-13 — Carte de réservation : pas de choix de créneau, mur de connexion, et tout en bas sur mobile.** P1, M
- Captures : `11-fiche-espace-1440` (« Connectez-vous pour réserver »), `11b-fiche-espace-connecte-390` (la carte est après les avis, tout en bas).
- Problème : la carte collante (`lg:sticky lg:top-24`, `page.tsx:295`) liste deux prix et un bouton. L'utilisateur ne voit pas les disponibilités avant de se connecter ; sur mobile le bouton est sous toutes les sections, sans barre fixe.
- Pourquoi : Airbnb demande les dates dans la carte et n'affiche le prix qu'après (dossier P4). Le calendrier de disponibilité est une exigence du produit (`officeflex-context` §7.2 : « CTA Réserver toujours visible »).
- Correctif : date et créneau dans la carte, total TTC calculé par l'API existante ; barre fixe en bas sur mobile (« à partir de … » et « Réserver »). Connexion demandée au moment de confirmer, pas avant de voir la disponibilité. Aucune règle de prix ni d'accès n'est touchée (calcul serveur inchangé).
- Fichiers : `src/app/spaces/[slug]/page.tsx`, `src/app/api/spaces/[slug]/availability/route.ts` (lecture seule), `src/components/booking/booking-funnel.tsx`.

**F-14 — La fiche ne présente ni l'hôte, ni le lieu sur une carte, ni la disponibilité.** P1, M
- Capture : `11-fiche-espace-1440`.
- Problème : adresse en texte, horaires en liste de 7 lignes, pas de plan, pas de bloc « Proposé par » détaillé (ce qui est vérifié, ancienneté, temps de réponse réel), pas d'aperçu des créneaux libres.
- Correctif : bloc hôte (nom d'entreprise, « Entreprise vérifiée » avec ce qui est contrôlé), carte de localisation approximative, horaires condensés (« Lun.–ven. 9 h–18 h »), prochains créneaux libres. Les coordonnées de l'hôte restent masquées jusqu'à la réservation (règle existante).
- Fichiers : `src/app/spaces/[slug]/page.tsx`, `src/components/marketing/verified-badge.tsx`.

**F-15 — Le badge « Entreprise vérifiée » n'explique pas ce qu'il garantit.** P2, S
- Captures : cartes et fiche. Le badge est bien placé (marine, coche), mais il n'ouvre rien. Prévoir une info-bulle ou une fenêtre : SIRET contrôlé, e-mail professionnel, adresse de l'espace. Texte à valider côté produit pour ne rien promettre de plus que la vérification réelle.
- Fichiers : `src/components/marketing/verified-badge.tsx`.

### Tunnel de réservation

**F-16 — Quatre cartes empilées, récapitulatif seulement en bas, sans photo.** P1, M
- Captures : `12-tunnel-reservation-1440`, `12d-tunnel-creneau-390`, `12e-tunnel-erreur-cgv-390`.
- Problème : date, créneau, informations, récapitulatif sont quatre cartes de même poids ; le total n'apparaît qu'après le choix d'un créneau, tout en bas ; ni photo ni nom de l'espace dans un récapitulatif visible pendant la saisie ; la réassurance (« Vous ne serez débité qu'après acceptation ») est noyée dans un paragraphe.
- Correctif : deux colonnes au bureau (formulaire à gauche, récapitulatif collant à droite avec photo, date, créneau, total, conditions d'annulation) ; mobile : récapitulatif réduit collant en bas. Étapes numérotées seulement si c'est une vraie séquence.
- Fichiers : `src/components/booking/booking-funnel.tsx`, `src/app/spaces/[slug]/booking/page.tsx`.

**F-17 — Erreurs de saisie : bulle native du navigateur au lieu d'erreurs en ligne.** P1, S
- Capture : `12e-tunnel-erreur-cgv-390` : la bulle « Please fill out this field. » (anglais dans le navigateur de test) apparaît sur « Motif de la réservation ». Le champ est `required` (`booking-funnel.tsx:213`, `:221`), donc la validation native passe avant celle du composant : l'erreur « Vous devez accepter les conditions générales de vente… » écrite dans le code n'est atteinte qu'ensuite.
- Pourquoi : message dans la langue du navigateur, non stylé, qui disparaît ; les formulaires générés sans erreurs soignées sont un signe d'IA (https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website).
- Correctif : `noValidate` sur le formulaire et erreurs en ligne en français sous chaque champ, liées par `aria-describedby`, focus sur la première erreur. Le serveur reste l'autorité (aucun changement de règle).
- Fichiers : `src/components/booking/booking-funnel.tsx`, `src/components/ui/field.tsx`.

**F-18 — Choix de date par champ natif, sans aperçu de disponibilité.** P2, M
- Capture : `12-tunnel-reservation-1440`. Le champ date est un `input[type=date]` suivi du bouton « Voir les créneaux ». Un mini-calendrier grisant les jours fermés et complets (la donnée existe déjà côté bailleur, `month-calendar.tsx`) éviterait les essais.
- Fichiers : `booking-funnel.tsx`, `src/components/dashboard/month-calendar.tsx`.

### Espace locataire et messagerie

**F-19 — Le statut de la prochaine réservation affiche la valeur technique « CONFIRMED ».** P1, S
- Capture : `20-locataire-accueil-1440` (« Statut : CONFIRMED »).
- Fichier : `src/components/dashboard/tenant-home.tsx:79` écrit `{nextBooking.status}` directement. La liste des réservations, elle, traduit déjà (« Confirmée », « En attente de l'hôte »).
- Correctif : réutiliser le libellé français existant et l'afficher en badge.

**F-20 — Liste des réservations : pas de photo, blocs mal alignés, boutons en escalier sur mobile.** P2, M
- Captures : `21-locataire-reservations-390`. Montant et statut sont centrés dans une colonne étroite, les boutons « Annuler », « Signaler un litige », « Donner mon avis » ne s'alignent pas d'une carte à l'autre. Les statuts sont du texte gris, sans badge.
- Correctif : ligne par réservation avec vignette de l'espace, statut en badge, une action principale visible et les autres dans un menu. Prix et statut alignés à droite.
- Fichiers : `src/app/app/bookings/page.tsx`, `src/components/dashboard/cancel-booking-button.tsx`, `raise-dispute-button.tsx`.

**F-21 — Messagerie : bulles toutes grises, aucun repère sur l'espace.** P2, S
- Capture : `22b-messagerie-fil-1440`. Les messages de « Vous » et de l'hôte sont de la même teinte grise, seul l'alignement les distingue ; pas de rappel de la réservation (date, statut) dans l'en-tête ; bouton « Envoyer » grisé tant que le champ est vide, sans indication.
- Correctif : bulle sortante marine / texte blanc, entrante claire ; en-tête avec vignette, dates et statut ; état vide de la liste de conversations à soigner.
- Fichiers : `src/components/dashboard/message-thread.tsx`, `src/app/app/messages/[bookingId]/page.tsx`.

**F-22 — Pied de barre latérale et navigation des modes.** P3, S
- Captures : toutes les pages connectées. « Se déconnecter » est un lien centré sans icône, à distance de l'étiquette « ESPACE LOCATAIRE » ; le sélecteur « MODE Locataire / Bailleur » est une bonne idée mais le libellé « MODE » en capitales n'aide pas.
- Fichiers : `src/components/dashboard/app-shell.tsx`, `mode-switcher.tsx`, `sign-out-button.tsx`.

### Espace bailleur

**F-23 — Navigation latérale de 16 entrées sans groupes.** P1, M
- Captures : `30-bailleur-accueil-1440`. Accueil, Notifications, Vérification, Mes biens, Tous les espaces, Publications, Promotions, Calendrier, Réservations, Avis clients, Messagerie, Revenus, Comptabilité, Versements, Compte, Nous contacter : seize libellés de même poids. L'admin en compte dix-sept.
- Pourquoi : le bailleur vient pour trois choses (répondre aux demandes, gérer ses espaces, suivre l'argent). La liste plate masque les priorités et noie la tâche quotidienne.
- Correctif : trois groupes (Activité : demandes, calendrier, messagerie ; Mes espaces : biens, espaces, promotions, avis ; Finances : revenus, versements, comptabilité) plus Compte et Aide en pied ; badge de compte sur « Réservations ». La navigation reste de l'UX : les gardes de rôle serveur ne changent pas (`officeflex-security-guardrails`).
- Fichiers : `src/components/dashboard/app-shell.tsx`, `src/components/ui/sidebar-nav.tsx`.

**F-24 — Calendrier : débordement à 390 px, jours illisibles, axe en échec.** P1, M
- Captures : `35-bailleur-calendrier-390` (tous les numéros de jour sont en gris très pâle, ligne du mois qui dépasse), mesure axe : `color-contrast` « serious » sur 22 nœuds, `hOverflow` à 390 px.
- Problème : le calendrier ne montre pas les trois états (disponible, réservé, bloqué) de manière lisible ; la légende est un nuancier à peine distinct (vert pâle, beige pâle, gris pâle). Le sélecteur d'espace est en pastilles qui sélectionnent le brouillon par défaut.
- Correctif : trois états nettement distincts (plein, hachuré, barré), chiffres en encre, jour sélectionné avec détail des demandes en dessous, navigation par mois sur une ligne. Contraste 4,5:1 minimum.
- Fichiers : `src/components/dashboard/month-calendar.tsx`, `src/app/app/landlord/calendar/page.tsx`.

**F-25 — Liste des espaces sans vignette, page d'édition de 2 900 px.** P1, M
- Captures : `32-bailleur-espaces-1440`, `33-bailleur-espace-photos-1440`.
- Problème : « Mes espaces » est une liste de lignes de texte (nom, adresse, type, statut en texte) ; aucune vignette, aucun signal « photos manquantes ». L'édition regroupe informations, adresse, équipements, photos, tarifs, horaires en une seule page de 2 900 px ; les champs d'heure sont tronqués (« 09:00 AN », « 06:00 PN »). La zone Photos, la plus importante pour la conversion, n'est qu'un bouton « Ajouter des photos » et une ligne de limites.
- Correctif : liste en grille de cartes photo avec statut en badge ; édition en sections navigables (ancres collantes) ; zone photos avec dépôt par glisser, aperçu, ordre, photo de couverture, légendes et conseils visuels (exemple de bon cadrage) ; champs d'heure assez larges.
- Fichiers : `src/app/app/landlord/spaces/page.tsx`, `src/components/dashboard/space-form.tsx`, `space-photo-manager.tsx`.

**F-26 — Indicateurs : quatre cartes identiques, étiquette en capitales, aucun contexte.** P2, S
- Captures : `30-bailleur-accueil-1440`, `20-locataire-accueil-1440`.
- Problème : « Revenus du mois / de l'année / Réservations / Espaces » sans comparaison, tendance ni action ; les revenus sont le chiffre qui motive le bailleur (`officeflex-context` §7.3).
- Correctif : une ligne de chiffres sans cartes, avec évolution vs mois précédent quand elle existe, et un graphique simple si les données le permettent. Pas de projection chiffrée inventée.
- Fichiers : `src/components/dashboard/landlord-home.tsx`, `src/app/app/landlord/revenue/page.tsx`.

**F-27 — « Premiers pas » : bonne idée, trop lourde.** P3, S
- Capture : `30-bailleur-accueil-1440`. Huit étapes dont six cochées occupent plus de la moitié de l'écran. Replier les étapes terminées, mettre l'action suivante en avant, masquer la liste à 100 %.
- Fichier : `src/components/dashboard/onboarding-checklist.tsx`.

### Admin

**F-28 — Tableaux de bord : indicateurs trompeurs et chiffres sans contexte.** P2, M
- Capture : `50-admin-dashboard-1440`. « Conversion recherche → réservation 50,0 % » avec la mention « approximation, pas un tunnel par visiteur » ; « Délai de réponse entreprise 0 min » ; « Satisfaction client : Non instrumenté » en gros caractères gris.
- Pourquoi : un chiffre affiché en grand est lu comme fiable. Ici deux sont des artefacts de la base de test ou d'un calcul approché.
- Correctif : distinguer « mesuré » et « approché » visuellement, masquer ce qui n'est pas instrumenté, afficher « données insuffisantes » plutôt qu'un chiffre. Ne pas ajouter de cible chiffrée fictive.
- Fichiers : `src/app/admin/dashboard/page.tsx`.

**F-29 — Barre latérale fixe à 768 px : les tableaux débordent.** P2, M
- Captures : `55-admin-utilisateurs-768`, `53-admin-annonces-768` (débordement horizontal mesuré).
- Problème : la barre de 256 px reste affichée à 768 px et laisse 512 px au contenu ; le tableau « Utilisateurs » passe les dates sur trois lignes. La barre ne se replie en menu qu'en dessous de 768 px.
- Correctif : replier la navigation sous 1024 px (icônes ou menu), tableaux en lignes responsives (colonnes secondaires masquées).
- Fichiers : `src/components/ui/sidebar-nav.tsx`, `src/app/admin/layout.tsx`, `src/components/ui/table.tsx`.

**F-30 — « À traiter » : correct, mais sans tri ni priorité visuelle.** P3, S
- Capture : `51-admin-a-traiter-1440`. La file est lisible (type, date, ancienneté en rouge). Ajouter des puces de filtre par type et mettre le plus ancien en tête visuellement.
- Fichiers : `src/app/admin/review-queue/page.tsx`.

### Pages éditoriales, authentification, états

**F-31 — Pages « Proposer un espace », « Comment ça marche », « À propos » : le gabarit générique complet.** P1, M
- Capture : `04-proposer-un-espace-1440`. Hero marine centré avec étiquette dorée en capitales, deux boutons, trois cartes à icône en cercle, quatre cartes numérotées 1 à 4 avec icônes dorées, bouton centré.
- Problème : cumule les signes du dossier d'inspiration (section 4, points 3, 4, 8). Ces pages sont l'entrée du côté bailleur, le plus difficile à recruter.
- Correctif : hero asymétrique avec une vraie photo d'espace partenaire, un exemple concret de ligne de revenu (utiliser l'exemple du cahier des charges, présenté comme exemple, jamais comme promesse), étapes en liste verticale numérotée (vraie séquence), FAQ intégrée.
- Fichiers : `src/app/(marketing)/proposer-un-espace/page.tsx`, `comment-ca-marche/page.tsx`, `a-propos/page.tsx`, `src/components/marketing/page-hero.tsx`.

**F-32 — Connexion et inscription : pages nues.** P2, S
- Capture : `08-login-1440`. Un formulaire centré sur fond gris, sans image ni réassurance ; le sous-titre « Accédez à votre espace client ou entreprise » parle de « client », alors que l'app dit « locataire ».
- Correctif : écran partagé avec photo d'un espace à gauche au bureau, vocabulaire unifié (locataire, bailleur).
- Fichiers : `src/app/(auth)/login/page.tsx`, `src/components/auth/login-form.tsx`, `register-form.tsx`, `signup-wizard.tsx`.

**F-33 — E-mails : l'ancienne marque « OfficeFlex » dans l'en-tête.** P1, S
- Capture : `60-email-confirmation-768`. L'en-tête affiche « OfficeFlex » (blanc + or) alors que le pied de page et le sujet disent « MakomSpace » ; fond crème `#F4F1EA`, police Arial, aucun logo « M ».
- Fichier : `src/server/domains/notifications/layout.ts:144` (texte « Office » + « Flex » écrit en dur, alors que `BRAND_NAME` existe en ligne 15) ; fond `PAGE_BACKGROUND` ligne 18.
- Pourquoi : un e-mail de confirmation est le premier objet de marque que le locataire garde ; le nom différent peut passer pour un hameçonnage.
- Correctif : wordmark MakomSpace issu de `BRAND_NAME`, logo en image hébergée sur le domaine, fond blanc ou gris neutre, un seul bouton, lignes de détail plus lisibles. Les e-mails restent en table HTML (clients de messagerie).
- Attention : `src/server/` est du code serveur ; la PR de design ne touche ni au contenu des modèles, ni aux données envoyées, ni au fournisseur.

**F-34 — 404 et états vides : corrects, génériques.** P3, S
- Captures : `10-404-1440`, `24-favoris-vide-1440`. 404 : icône boussole dans un cercle gris et « ERREUR 404 » en capitales ; états vides : texte centré sans visuel. Honnêtes et accessibles mais interchangeables.
- Correctif : 404 avec une phrase d'orientation et la recherche en pilule ; états vides avec une vraie carte d'espace suggérée quand elle existe.
- Fichiers : `src/app/not-found.tsx`, `src/components/dashboard/states.tsx`, `src/components/ui/empty.tsx`.

### Mouvement, performance, mobile

**F-35 — Mouvement : un seul geste répété, pas de transition de page, chargement générique.** P2, M
- Code : le seul mouvement observable est le survol des cartes (`whileHover={{ y: -4 }}`, `space-card.tsx:71`) et `FadeIn` sur la fiche ; le chargement est un spinner plus un squelette de page générique (`src/components/dashboard/states.tsx:59-77`), le même pour tous les écrans.
- Correctif : squelettes à la forme réelle de chaque écran (cartes, tableau), transitions de 150 à 200 ms, déplacement de la carte de réservation, respect de `prefers-reduced-motion` (à vérifier dans `motion-provider.tsx`).
- Fichiers : `src/components/motion-provider.tsx`, `src/components/ui/fade-in.tsx`, `states.tsx`, `src/app/search/loading.tsx`.

**F-36 — LCP élevé en mobile simulé ; une page ne retombe jamais au repos.** P2, M
- Mesures : LCP 3,2 à 4,4 s (Lighthouse) ; `/app/landlord/payouts` n'atteint pas `networkidle` ; LCP recherche à 390 px 4,7 s en local.
- Correctif : photo du hero dimensionnée et préchargée (déjà `preload`), pas d'illustration de plus de 100 Ko ; carte chargée à la demande (déjà un chargeur dédié, `search-map-loader.tsx`), tuiles à l'interaction ; investiguer la requête restée ouverte sur « Versements ».
- Fichiers : `src/components/marketing/hero.tsx`, `search-map-loader.tsx`, `src/app/app/landlord/payouts/page.tsx`.

**F-37 — Mobile : navigation par « Menu » seulement, pas de barre d'action.** P2, M
- Captures : `11b-fiche-espace-connecte-390`, `21-locataire-reservations-390`. Aucun élément collant en bas d'écran ; les actions principales (réserver, accepter) ne sont pas à portée de pouce ; le menu des espaces connectés est un bouton « Menu » qui ouvre toute la liste.
- Correctif : barre d'action basse sur la fiche et le tunnel ; navigation basse à quatre onglets pour le locataire ; gabarit de cartes « demande de réservation » avec actions larges pour le bailleur.
- Fichiers : `src/components/ui/sidebar-nav.tsx`, `app-shell.tsx`, `mobile-menu.tsx`.

## 5. Synthèse des priorités

| Sévérité | Constats |
|---|---|
| P0 | F-01 photographie, F-12 galerie de la fiche |
| P1 | F-02, F-03, F-05, F-06, F-08, F-09, F-13, F-14, F-16, F-17, F-19, F-23, F-24, F-25, F-31, F-33 |
| P2 | F-04, F-07, F-10, F-15, F-18, F-20, F-21, F-26, F-28, F-29, F-32, F-35, F-36, F-37 |
| P3 | F-11, F-22, F-27, F-30, F-34 |

Rapides à corriger (effort S, effet visible immédiat) : F-19 (statut brut), F-33 (nom de marque dans les e-mails), F-17 (erreurs de formulaire), F-03 (capitales), F-10 (carte d'espace).

## 6. Ce qui n'est pas dans cet audit

- Aucune faille de sécurité ni correction d'autorisation, de prix ou de paiement n'est proposée ici. Les constats F-13 et F-33 touchent des écrans proches de ces zones : toute PR correspondante doit se limiter à la présentation.
- Le tunnel de paiement par carte (Stripe) n'a pas été observé.
- L'import et l'affichage de vraies photos (stockage) n'ont pas été testés.
