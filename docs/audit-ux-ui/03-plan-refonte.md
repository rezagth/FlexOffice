# 03 — Plan de refonte UX/UI MakomSpace

Date : 20 octobre 2026. Phase D. S'appuie sur `01-dossier-inspiration.md` (direction A recommandée) et `02-audit-ux-ui.md` (constats F-01 à F-37). La maquette de la direction A est dans `maquette.html`.

## 0. Principes d'exécution

- **Une PR de design ne change jamais** une autorisation, un prix, une commission, un montant, un paiement, un webhook, une migration, un schéma ou une règle de disponibilité. Si un écran de design demande de toucher à l'un d'eux, on sépare : une PR « données » relue avec `officeflex-security-guardrails`, puis une PR « présentation ».
- **Git** : on travaille sur `develop`, une branche par lot (`design/lot-0-fondations`, etc.), PR vers `main`, jamais de commit direct sur `main`.
- **Base de données** : aucun test ne s'exécute contre la base du `.env`. L'environnement de captures de l'audit (copie du dépôt, Postgres local, faux serveur d'authentification) est la référence ; un script d'amorçage versionné est à ajouter (voir action 3).
- **Chaque lot** se livre avec : captures avant/après à 390, 768 et 1440 px, axe sans violation, `pnpm lint`, `pnpm typecheck`, `pnpm test`, build.
- **Honnêteté du contenu** : aucune note, aucun avis, aucun chiffre, aucune image générée, aucun témoignage fictif, dans le code comme dans les captures de PR.
- **Périmètre produit** : le design ne crée pas de fonctionnalité V2/V3 (Verified, Score, Premium, abonnements, recommandation IA). Le badge « Entreprise vérifiée » existe déjà dans le code ; le design le met en valeur sans en élargir la signification.

## Vue d'ensemble

| Lot | Titre | Jours | Dépend de | Findings couverts |
|---|---|---|---|---|
| 0 | Fondations (direction artistique, jetons, composants) | 4 à 5 | décision D1 | F-02, F-03, F-04, F-07 (partiel) |
| 1 | Accueil, recherche, fiche espace | 9 à 11 | lot 0 ; photos pour la recette finale | F-01, F-05, F-06, F-08 à F-15 |
| 2 | Tunnel de réservation et e-mails | 5 à 6 | lot 0 | F-16 à F-18, F-33, F-19 |
| 3 | Espaces connectés (bailleur, locataire, admin) | 10 à 12 | lot 0 | F-20 à F-30 |
| 4 | Mouvement, chargements, mobile, accessibilité, performance | 5 à 6 | lots 1 à 3 | F-35 à F-37, F-24 |
| 5 | Photos et contenu | 6 à 8 de travail interne, plus la séance | peut démarrer tout de suite | F-01, F-07, F-27 |
| | **Total** | **39 à 48 jours** | | |

Les lots 1, 2 et 3 peuvent avancer en parallèle après le lot 0 s'ils ne touchent pas les mêmes fichiers (le lot 1 touche `src/components/marketing/*`, le lot 2 `src/components/booking/*` et `src/server/domains/notifications/layout.ts`, le lot 3 `src/components/dashboard/*` et les pages `/app`, `/admin`). Le lot 5 est la voie critique : la séance photo demande des rendez-vous avec des bailleurs réels.

---

## Lot 0 — Fondations

**Objectif.** Poser la direction A dans le code pour que les lots suivants n'aient plus qu'à composer : jetons, composants de base, règles d'usage. Corriger les défauts transversaux (F-02, F-03, F-04) une fois pour toutes.

**Écrans touchés.** Tous, de façon visible mais légère (rayons, ombres, étiquettes, titres).

**Travail.**
1. **Jetons** dans `src/app/globals.css` : fond blanc pour le public, gris `#f6f7f9` pour le connecté, encre marine, ardoise, couleurs d'état contrôlées à 4,5:1, trois rayons (8, 16, pilule), deux ombres, durées et courbe de mouvement. Remplacer le rayon unique `--radius: 1rem`.
2. **Typographie** : conserver Plus Jakarta Sans et Inter (déjà locales, `src/app/fonts.ts`). Définir six tailles, trois graisses, `tabular-nums` pour les montants. Vérifier l'espacement des mots des titres ; si besoin, ajouter le `word-spacing` ou resserrer le tracking des titres.
3. **Surcharges des composants** : `Card` (deux variantes : `surface` sans ombre avec bordure fine ; `floating` avec ombre), `Button` (rayon 8 px par défaut pour les actions de formulaire, pilule pour la recherche et les filtres), `Badge`, `Field`/`Input` (état d'erreur en ligne, message lié par `aria-describedby`), `Table` (lignes à filets, en-têtes en casse normale).
4. **Nouveaux composants de base** : `Chip` (pastille de filtre), `StatusBadge` (statut de réservation en français, un seul endroit pour les libellés, réutilisé en F-19), `PhotoFrame` (rapport fixe, repli sobre quand il n'y a pas de photo), `StickyActionBar`, `SectionHeading` (titre + sous-titre sans étiquette en capitales).
5. **Règle d'icônes** : lucide-react, trait 1,5 px, 20 px, jamais dans un cercle coloré. Retirer `uppercase tracking-wide` des libellés d'indicateurs ; les capitales ne restent que sur les en-têtes de colonnes de tableaux.
6. **Page de référence** `/design` (non indexée, accessible seulement en développement) qui montre tous les composants. Elle sert de base aux tests visuels.

**Fichiers.** `src/app/globals.css`, `src/app/fonts.ts`, `src/components/ui/{card,button,badge,field,input,table,empty,skeleton}.tsx`, nouveaux `src/components/ui/{chip,status-badge,photo-frame,sticky-action-bar,section-heading}.tsx`, `src/lib/format.ts` (libellés de statuts, sans changer de logique).

**Critères d'acceptation.**
- Plus aucune utilisation directe de `rounded-2xl` hors des variantes de `Card` ; plus de `uppercase tracking-wide` sur des libellés (hors en-têtes de tableaux). Vérifié par une recherche automatisée dans la CI.
- Contrastes de tous les couples texte/fond des jetons ≥ 4,5:1 (3:1 pour les contours de contrôle), listés dans un commentaire de `globals.css`.
- Aucune régression de mise en page : captures avant/après de 8 écrans de référence (accueil, recherche, fiche, tunnel, `/app`, bailleur espaces, admin dashboard, e-mail), différences expliquées.
- Aucun changement de comportement : `git diff --stat` ne contient aucun fichier sous `src/server/` (hors constantes de libellés), `prisma/`, `src/app/api/`.

**Tests.** axe sur les écrans de référence ; Playwright : parcours existants dans `tests/e2e` doivent rester verts ; ajout d'un test unitaire des libellés de statut ; capture automatique des 8 écrans.

**Risques.** Changer `--radius` déplace tous les composants shadcn : traiter en une seule PR, avec captures. Ne pas renommer les variantes de `Button` (une cinquantaine d'appels, voir commentaire de `button.tsx`). Le test d'isolation tenant et le test d'exclusion de réservation ne sont pas concernés et ne doivent pas être modifiés.

**Stratégie de PR.** Deux PR : (a) jetons et typographie, (b) composants et nettoyage. Relecture visuelle obligatoire avant fusion.

**Estimation.** 4 à 5 jours.

---

## Lot 1 — Accueil, recherche, fiche espace

**Objectif.** Rendre l'entrée du parcours locataire crédible et « photo d'abord » (F-01, F-05, F-06, F-08 à F-15).

**Écrans.** `/`, `/search`, `/spaces/[slug]`, états vides de la recherche.

**Travail.**
1. **Accueil** : hero asymétrique avec barre de recherche en pilule (`hero-search.tsx` repensé), photo réelle d'un espace partenaire (ou, tant qu'elle n'existe pas, bloc neutre sans illustration), bandeau d'espaces réels sous la barre, une seule section de preuve vérifiable (exemple de fiche avec ce qui est contrôlé : SIRET, e-mail professionnel, adresse), un bloc bailleur sur fond marine, suppression du comparatif « café / bureau » en cartes (le message peut devenir une phrase) et des quatre cartes à icône.
2. **Recherche** : pilule compacte, rangée de pastilles, panneau « Filtres », liste à gauche et carte collante à droite au bureau, bouton « Carte » sur mobile ; carte d'espace refaite (photo 4:3, prix « à partir de … la demi-journée »).
3. **Fiche** : mosaïque 1 + 4 et visite plein écran légendée (clavier, focus piégé proprement, fermeture avec Échap), titre au-dessus de la galerie, navigation d'ancres, bloc hôte, localisation approximative, horaires condensés, carte de réservation collante avec date et créneau (lecture de la disponibilité via l'API existante), barre fixe en bas sur mobile.
4. **Badge « Entreprise vérifiée »** avec info-bulle (texte validé par le produit).

**Fichiers.** `src/app/(marketing)/page.tsx`, `src/components/marketing/{hero,hero-search,problem-section,how-it-works,trust-badges,space-card,search-results-grid,search-map,search-map-loader,photo-carousel,verified-badge,site-header,site-footer}.tsx`, `src/app/search/page.tsx`, `src/app/spaces/[slug]/page.tsx`, nouveaux composants de galerie. En lecture seule : `src/app/api/spaces/[slug]/availability/route.ts`, `src/server/domains/spaces/*`.

**Critères d'acceptation.**
- Une fiche à 1, 2, 5 et 12 photos s'affiche correctement (mosaïque dégradée proprement), au clavier et au tactile.
- Aucun texte « Photo à venir » visible par un visiteur. Un espace sans photo suffisante : voir décision D2.
- La carte de réservation affiche le prix calculé **par l'API existante** ; le navigateur n'envoie aucun montant (vérifier dans l'onglet réseau et par un test qui échoue si un `priceAmountCents` est lu depuis le corps).
- Mobile 390 px : le bouton de réservation est visible sans défiler jusqu'en bas ; aucun débordement horizontal.
- LCP de l'accueil et de la fiche < 2,5 s en Lighthouse mobile local (mesure de laboratoire).
- axe : aucune violation ; Lighthouse accessibilité = 100.

**Tests.** Playwright : recherche à pilule (saisie, pastilles, panneau), ouverture et fermeture de la visite photo, carte collante au défilement, barre fixe mobile ; axe sur 6 écrans ; captures à trois largeurs ; test e2e existant `public-journeys.spec.ts` mis à jour sans l'affaiblir.

**Risques.** Disponibilité affichée dans la fiche : ne jamais la recalculer côté client ; l'API reste la source. Le fond de carte doit respecter la politique d'usage des tuiles (décision D5). Pas de note ni d'avis affichés s'ils n'existent pas (règle déjà dans `space-card.tsx`).

**Stratégie de PR.** Trois PR : accueil, recherche, fiche. Fiche en dernier, car la plus risquée.

**Estimation.** 9 à 11 jours.

---

## Lot 2 — Tunnel de réservation et e-mails

**Objectif.** Un tunnel à deux colonnes avec récapitulatif toujours visible, des erreurs claires, des e-mails à la bonne marque (F-16, F-17, F-18, F-33, F-19).

**Écrans.** `/spaces/[slug]/booking`, confirmation, `/app/bookings` (statut), e-mails de réservation (demande, reçue, confirmée, refusée, expirée, rappel, annulations).

**Travail.**
1. **Tunnel** : formulaire à gauche, récapitulatif collant à droite (photo, espace, date, créneau, total, conditions d'annulation lisibles) ; mobile : récapitulatif réduit collant en bas ; mini-calendrier de disponibilité ; `noValidate` et erreurs en ligne en français, focus sur la première erreur ; case des CGV avec message ; états d'envoi et d'échec.
2. **Confirmation** : page dédiée « Demande envoyée » avec rappel des étapes suivantes (réponse de l'hôte, débit après acceptation), au lieu d'une redirection brute vers la liste.
3. **E-mails** : wordmark `BRAND_NAME` à la place de « OfficeFlex » codé en dur (`layout.ts:144`), logo hébergé, fond neutre, hiérarchie des lignes de détail, un bouton. Rendu contrôlé dans Gmail, Outlook et Apple Mail via captures.
4. **Statut** : utiliser le libellé français du lot 0 sur `/app` (F-19).

**Fichiers.** `src/components/booking/{booking-funnel,stripe-card-step}.tsx`, `src/app/spaces/[slug]/booking/page.tsx`, `src/components/dashboard/tenant-home.tsx`, `src/server/domains/notifications/layout.ts` (présentation uniquement), tests des modèles.

**Critères d'acceptation.**
- Les erreurs de saisie s'affichent en français, en ligne, sans bulle native ; testées au clavier et au lecteur d'écran (annonce par `aria-live`).
- Le récapitulatif affiche exactement les montants renvoyés par le serveur ; la requête envoyée ne contient que les champs actuels (espace, date, créneau, participants, motif, acceptation).
- Les e-mails portent « MakomSpace » partout ; un test unitaire compare le texte de l'en-tête à `BRAND_NAME` ; le texte brut de chaque modèle est inchangé.
- Aucune différence de comportement du paiement : le mode mock et le mode Stripe produisent les mêmes appels qu'avant.

**Tests.** Test unitaire de rendu des modèles (sujet, texte, HTML échappé : une valeur contenant `<script>` reste inerte) ; Playwright : erreur de CGV, erreur de motif, sélection de créneau, parcours complet en mode mock ; capture des e-mails à 390 et 600 px.

**Risques.** `src/server/domains/notifications/layout.ts` est du code serveur qui échappe les données utilisateur : on ne touche pas à `escapeHtml` ni à la construction des liens (`appUrl`). L'iframe Stripe (mode carte) n'est pas testable avec le faux serveur : la recette complète se fait sur un environnement de prévisualisation avec les clés de test. Ne jamais envoyer d'e-mail réel pendant le développement (fournisseur `log`).

**Stratégie de PR.** Deux PR : tunnel (présentation), e-mails. Relecture par la personne en charge du paiement.

**Estimation.** 5 à 6 jours.

---

## Lot 3 — Espaces connectés

**Objectif.** Faire des espaces locataire, bailleur et admin des outils clairs, pas des piles de cartes (F-19 à F-30).

**Écrans.** Locataire : `/app`, réservations, messagerie, factures, favoris, notifications, compte. Bailleur : accueil, demandes, espaces et édition, biens, calendrier, revenus, comptabilité, versements, promotions, vérification, avis. Admin : vue d'ensemble, à traiter, vérifications, annonces, litiges, utilisateurs, support, paiements, factures.

**Travail.**
1. **Navigation** : groupes (activité, espaces, finances), navigation repliée sous 1024 px, navigation basse pour le locataire sur mobile, étiquettes en casse normale.
2. **Locataire** : accueil sans cartes de chiffres (les trois indicateurs deviennent une ligne), prochaine réservation avec photo et statut en badge, liste de réservations en lignes avec vignette, messagerie avec bulles distinctes et en-tête de réservation.
3. **Bailleur** : accueil centré sur « demandes à traiter » puis revenus ; premiers pas repliés quand terminés ; liste d'espaces en cartes photo avec statut et alerte « photos manquantes » ; édition en sections avec ancres ; gestionnaire de photos (glisser-déposer, ordre, couverture, légendes, conseils de cadrage avec exemple) ; calendrier redessiné (trois états visibles, contraste 4,5:1, détail du jour) ; demandes avec actions larges.
4. **Admin** : « À traiter » avec filtres et priorité visuelle ; tableaux responsives ; indicateurs distinguant mesuré, approché, non instrumenté ; aucun chiffre trompeur affiché en grand (F-28).

**Fichiers.** `src/components/dashboard/*`, `src/components/ui/sidebar-nav.tsx`, `src/app/app/**`, `src/app/admin/**` (présentation seulement), `src/components/ui/table.tsx`.

**Critères d'acceptation.**
- `git diff` sans modification des gardes de rôle ni des capacités : `requirePageAuth`, `requireRole`, `requireOrg`, `capabilities.has(...)`, les requêtes Prisma et leurs `where` restent identiques. Un contrôle automatisé liste les fichiers modifiés et signale tout changement dans `src/server/`, `src/app/api/` et dans les `where` des pages.
- Le test d'isolation tenant (`tests/integration`) et le test de contrainte d'exclusion restent verts et inchangés.
- Calendrier : 0 violation axe, aucun débordement à 390 px.
- Admin à 768 px : aucun débordement horizontal.
- Chaque liste a un état vide avec action de sortie ; chaque page lente a un squelette à sa forme.
- Le gestionnaire de photos refuse les fichiers hors liste (types et poids) **côté serveur comme aujourd'hui** ; le design n'élargit rien.

**Tests.** Playwright avec les trois comptes de test (états de session générés par le script d'environnement) ; axe sur toutes les pages listées ; captures à trois largeurs ; test que la navigation d'un comptable n'affiche pas « Mes biens » (comportement actuel conservé, `app-shell.tsx`).

**Risques.** C'est le lot le plus long et le plus proche de zones sensibles (rôles, organisations, argent). Les pages revenus, comptabilité, versements et factures affichent des montants : on ne change que la mise en page, jamais le calcul. Le téléversement de photos dépend du stockage externe non disponible dans l'environnement local : recette sur prévisualisation.

**Stratégie de PR.** Une PR par espace : locataire, bailleur (en deux : espaces/photos, calendrier/finances), admin. Relecture « sécurité » rapide de chaque PR avec la checklist de `officeflex-security-guardrails` (§12).

**Estimation.** 10 à 12 jours.

---

## Lot 4 — Mouvement, chargements, mobile, accessibilité, performance

**Objectif.** Donner la sensation « fait main » et fermer les écarts de performance et d'accessibilité (F-35, F-36, F-37, F-24).

**Travail.**
1. **Mouvement** : un vocabulaire unique (150 à 200 ms, une courbe, un déplacement de 2 à 4 px), entrée du hero, survol de photo, ouverture de la visite photo, carte de réservation, retour visuel des boutons ; tout désactivé sous `prefers-reduced-motion`. Retirer l'effet `y:-4` à ressort de chaque carte au profit d'un zoom de photo léger.
2. **Chargements** : squelettes à la forme réelle (carte d'espace, ligne de réservation, tableau), dans `loading.tsx` de chaque segment ; états d'erreur de page cohérents.
3. **Mobile** : barres d'action basses, zones tactiles ≥ 44 px, formulaires en une colonne, tests sur trois largeurs.
4. **Accessibilité** : audit manuel clavier et lecteur d'écran des parcours clés (recherche, fiche, tunnel, acceptation d'une demande), focus visible, annonces d'erreurs, ordre des titres.
5. **Performance** : budget par page (poids des images, JS, polices), images en AVIF/WebP à la bonne taille, carte chargée à l'interaction, investigation de la requête restée ouverte sur « Versements ».

**Fichiers.** `src/components/motion-provider.tsx`, `ui/{fade-in,skeleton}.tsx`, `dashboard/states.tsx`, les `loading.tsx`, `next.config.ts` (images seulement), `src/app/search/loading.tsx`.

**Critères d'acceptation.**
- Lighthouse mobile local : performance ≥ 90 sur les 5 pages clés, LCP < 2,5 s, CLS < 0,1, TBT < 200 ms. axe : 0 violation sur toutes les pages. Lighthouse accessibilité = 100.
- Parcours clavier complet sans piège de focus sur la visite photo et le tunnel.
- Aucun mouvement avec `prefers-reduced-motion: reduce` (test Playwright qui émule la préférence).

**Tests.** Lighthouse et axe en CI sur les 5 pages publiques ; Playwright en émulation mobile et en mouvement réduit ; mesure de CLS/LCP par `PerformanceObserver` conservée dans le script de capture.

**Risques.** Les mesures de laboratoire locales ne valent pas des mesures de terrain : prévoir un suivi des Core Web Vitals en production (outil déjà installé : à confirmer, voir dépendances). Ne pas ajouter de dépendance d'animation en plus de `motion`.

**Stratégie de PR.** Une PR par thème (mouvement, chargements, performance), chacune avec ses mesures avant/après.

**Estimation.** 5 à 6 jours.

---

## Lot 5 — Photos et contenu

**Objectif.** Remplacer les illustrations par des photographies réelles et réécrire la microcopy (F-01, F-07, F-27). Voie critique du projet.

**Travail.**
1. **Séance photo** chez 3 à 5 bailleurs (un peu plus si certains espaces sont refusés) : un cahier des charges (lumière naturelle, plan large de l'espace tel qu'il est, détails écran / table / accueil, rapport 4:3 et 3:2, pas de personnes reconnaissables, sans retouche trompeuse), un formulaire de cession de droits et de consentement du bailleur, une convention de nommage, un tri et un export optimisé.
2. **Photo de couverture du hero** choisie parmi ces espaces, avec l'accord écrit du bailleur.
3. **Microcopy** : réécriture des titres, sous-titres, boutons, messages d'erreur et e-mails en français, ton professionnel, rassurant, direct ; suppression des phrases d'ambiance ; glossaire (locataire, bailleur, créneau, demande, hôte) appliqué partout ; relecture juridique des mentions sur la vérification et le paiement.
4. **Guide de cadrage pour les bailleurs** dans le gestionnaire de photos (3 exemples réels de bon cadrage issus de la séance).
5. **Règle de publication** : seuil minimal de photos (par exemple 3 photos conformes) avant publication ; voir D2.

**Fichiers.** Contenu et textes : `src/app/(marketing)/**`, `src/components/marketing/*`, `src/components/dashboard/onboarding-checklist.tsx`, modèles d'e-mails ; images hors dépôt (stockage) ; guide dans le gestionnaire de photos.

**Critères d'acceptation.**
- Chaque photo publiée a un accord écrit du bailleur ; aucune photo de banque d'images ni générée par IA.
- Aucune formule de la liste « vocabulaire creux » ne subsiste (recherche dans le dépôt) ; glossaire respecté.
- Les textes n'affirment que ce que la plateforme fait (vérification SIRET, e-mail professionnel et adresse ; paiement par prestataire agréé ; réponse sous 24 h ouvrées).

**Tests.** Relecture croisée de la copie ; vérification automatique des mots proscrits ; contrôle du poids des images ; captures avant/après.

**Risques.** Droit à l'image et droits d'auteur ; bailleurs peu disponibles ; photos non conformes. Tant que les photos ne sont pas prêtes, les lots 1 à 4 se recettent avec des cadres neutres, pas avec des illustrations ni des images de remplacement.

**Stratégie de PR.** Contenu texte en PR séparées par zone (accueil, éditorial, e-mails, espaces connectés). Les images ne passent pas par le dépôt (stockage prévu par le produit).

**Estimation.** 6 à 8 jours de travail interne (cahier des charges, tri, copie), plus la séance elle-même (1 à 2 jours de terrain, selon le prestataire).

---

## Les 5 premières actions

1. **Valider la direction A** (décision D1) et recouper avec les notes déjà établies du projet Claude (37, 36, 12 et 16), que je n'ai pas pu lire.
2. **Lancer le lot 5 tout de suite** : identifier 3 à 5 bailleurs d'accueil, valider le cahier des charges photo et le modèle d'autorisation d'image. C'est la voie critique.
3. **Versionner l'environnement de captures** (script d'amorçage local, comptes de test, mode démo enrichi) dans `scripts/` ou `docs/`, sans secrets, pour que chaque PR puisse produire ses captures.
4. **Ouvrir le lot 0** sur `develop` : jetons, composants de base, page de référence ; fusionner avant tout autre lot.
5. **Corriger d'abord les trois défauts rapides** qui n'attendent pas la refonte : statut brut « CONFIRMED » (F-19), « OfficeFlex » dans l'en-tête des e-mails (F-33), validation native du tunnel (F-17). Une petite PR chacun, avec test.

## Décisions à prendre (6 au maximum)

**D1. Adopte-t-on la direction A « Marine et lumière » (marine comme encre, or en signature, photo d'abord, polices actuelles conservées) ?** Réponse : oui / non / variante. **Recommandation : oui.** Raison : respecte la charte, coût nul en polices, évite le piège « seconde vague » (crème et serif).

**D2. Un espace sans photo suffisante peut-il être publié ?** Réponse : oui, avec un cadre neutre / non, il faut au moins 3 photos conformes. **Recommandation : non, minimum 3 photos.** Raison : la photo porte la confiance ; un « Photo à venir » public contredit la promesse. À arbitrer avec le produit car cela change une règle de publication (donc un lot de données, pas de design).

**D3. Peut-on demander la date et le créneau dans la carte de réservation de la fiche, avant la connexion, avec connexion demandée à la confirmation ?** Réponse : oui / non. **Recommandation : oui.** Raison : on voit la disponibilité avant de s'engager, comme sur Airbnb. Impact : présentation seulement ; la route de disponibilité (`src/app/api/spaces/[slug]/availability/route.ts`) n'exige pas de connexion et est limitée en débit.

**D4. Quelle priorité de séance photo : avant le lot 1 ou en parallèle ?** Réponse : avant / en parallèle. **Recommandation : en parallèle, démarrage immédiat.** Raison : les lots 1 à 4 utilisent des cadres neutres pour la recette ; les vraies photos arrivent pour la recette finale.

**D5. Fond de carte : rester sur Leaflet avec OpenStreetMap, ou passer à un fournisseur de tuiles dédié avant le lancement ?** Réponse : rester / passer. **Recommandation : passer à un fournisseur de tuiles à clé dédiée avant l'ouverture publique, rester sur OpenStreetMap en développement.** Raison : l'usage de production sur les tuiles OpenStreetMap publiques est encadré (à vérifier dans leur politique d'usage avant décision, je ne l'ai pas consultée).

**D6. La refonte est-elle livrée lot par lot en production, ou derrière un drapeau jusqu'à la fin du lot 3 ?** Réponse : lot par lot / drapeau. **Recommandation : lot par lot, sur `develop`, avec déploiements de prévisualisation Vercel.** Raison : le projet n'est pas lancé (validation terrain), les petits lots réduisent le risque et les conflits.

## Dépendances externes

- **Photographe ou prestataire** et accord de 3 à 5 bailleurs ; modèle d'autorisation de droit à l'image (relecture juridique).
- **Stockage des médias** : Supabase Storage, absent de l'environnement local ; la recette des téléversements se fait sur une prévisualisation.
- **Fournisseur de tuiles de carte** (D5) si changement.
- **Hébergement du logo** utilisé dans les e-mails (domaine de production) et fichier vectoriel officiel du logo, que je n'ai pas : le composant `BrandMark` en SVG fait foi pour l'instant.
- **Clés de test Stripe** et environnement de prévisualisation pour valider l'étape carte du tunnel.
- **Validation juridique et produit** du libellé du badge « Entreprise vérifiée » et des mentions de remboursement.
- **CI** : exécution de Playwright, axe et Lighthouse (à brancher ; `@axe-core/playwright` est déjà une dépendance de développement).
- **Notes du projet Claude « FlexOffice »** : accès nécessaire pour recouper les décisions antérieures.
