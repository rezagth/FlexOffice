# 01 — Dossier d'inspiration MakomSpace

Date : 20 octobre 2026. Phase A de l'audit UX/UI. Aucune modification de code.

## 0. Méthode et limites (à lire d'abord)

Ce dossier distingue trois niveaux de preuve. Chaque observation porte son niveau.

- **[Vu]** : page ouverte dans le navigateur intégré, capture regardée, valeurs mesurées par script (`getComputedStyle`, `getBoundingClientRect`). Cas d'Airbnb uniquement, le 20/10/2026 sur airbnb.fr.
- **[Texte]** : contenu de la page lu via l'outil de lecture web (libellés, structure). Le rendu visuel (polices, couleurs, espacements) n'est pas connu. Les outils de lecture n'exposent pas le CSS.
- **[Source tierce]** : article ou analyse communautaire trouvé par recherche. C'est une opinion de praticien, pas une mesure.

Limites assumées :

1. Les documents du projet Claude « FlexOffice » (`37-ux-ui-design-makomspace.md`, `36-parcours-app-flow-makomspace.md`, `12-audit-fonctionnel-et-ux-ui.md`, `16-verification-5-chantiers-et-shadcn.md`) **n'ont pas pu être lus** : aucun outil de ce type n'est disponible dans cette session. Ce dossier s'appuie donc sur le code réel et sur les fichiers `docs/` du dépôt. Si ces notes contiennent des décisions déjà arrêtées, elles prévalent. Le recoupement est à faire à la relecture (décision D1 du plan).
2. Pour Airbnb, je n'ai pas pu observer les sections Avis et Hôte : elles se chargent à la demande et n'ont pas été rendues dans la page lue. Ce que j'en dis vient uniquement de l'ancre « Commentaires » dans la navigation de la fiche.
3. Je n'ai pas observé de lightbox Airbnb au sens strict. Ce qui existe est une « visite photo » plein écran (voir principe 3).
4. Les pages de Spacebase (HTTP 404 / contenu vide), de Land-book (HTTP 403) n'ont pas pu être lues. Mindspace et Industrious ont été lus en texte seulement. Mon premier essai sur `industrious.com` est tombé sur un studio de design homonyme, sans rapport : la bonne adresse est `industriousoffice.com`.
5. Les sites de référence changent. Les libellés cités sont ceux du 20/10/2026.

## 1. Références consultées

| Référence | URL réellement consultée | Niveau |
|---|---|---|
| Airbnb, résultats de recherche | https://www.airbnb.fr/s/Lyon--France/homes | Vu |
| Airbnb, fiche d'annonce | https://www.airbnb.fr/rooms/1693437816585792989 | Vu |
| Airbnb, page d'accueil | https://www.airbnb.fr/ | Texte |
| Industrious | https://www.industriousoffice.com/ | Texte |
| Mindspace | https://www.mindspace.me/ | Texte |
| Croissant | https://www.getcroissant.com/ | Texte |
| Deskpass | https://deskpass.com/ | Texte |
| Cal.com | https://cal.com/ | Texte |
| Stripe (France) | https://stripe.com/fr | Texte |
| Linear | https://linear.app/ | Texte |
| Mercury | https://mercury.com/ | Texte |
| Awwwards, catégorie Immobilier | https://www.awwwards.com/websites/real-estate/ | Texte |
| Mobbin | https://mobbin.com/ | Texte |
| Baymard, galeries en surimpression | https://baymard.com/product-page/benchmark/page-designs/image-gallery-overlay | Source tierce (résultat de recherche, page payante en grande partie) |
| Airbnb, reconstruction communautaire du système de design | https://getdesign.md/design-md/airbnb/preview.html | Source tierce, valeurs non officielles |
| « Signes d'un design généré par IA » (1) | https://capitalandcompute.net/blog/fix-ai-slop-design/ | Source tierce |
| « Signes d'un design généré par IA » (2) | https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website | Source tierce |

## 2. Ce qu'on a réellement observé sur Airbnb

### Barre de recherche [Vu]

- Pilule de **46 px de haut**, rayon **40 px**, bordure 1 px `#ddd`, fond blanc.
- Ombre en deux couches très légères : `0 1px 2px rgba(0,0,0,.08)` et `0 4px 12px rgba(0,0,0,.05)`.
- Segments : « Destination », « Dates », « Voyageurs » (« Ajouter des voyageurs »), séparés par des filets fins, bouton de recherche rond rouge à droite. Sur la page de résultats, la barre est **compacte** et centrée dans l'en-tête, avec des valeurs remplies (« Lyon · Logements », « Une semaine »).
- Sur la fiche, la même barre est réduite (icône, « N'importe où », « Dates flexibles », « Ajouter des voyageurs »).

### Page de résultats [Vu]

- Rangée de **filtres en pastilles** sous l'en-tête (« Filtres », « Parking gratuit », « Prix », « Wifi », « Type de logement »…), défilement horizontal avec chevron.
- Compteur « Lyon : Plus de 1 000 logements » et une ligne de réassurance « Prix indiqués taxes et frais inclus » avec une étiquette-icône.
- Mise en page liste + carte : la carte occupe la moitié droite, la liste à gauche.
- **Carte d'annonce** : photo plein cadre en 4:3 environ (440 × 330 px à cette largeur), angles très arrondis, badge blanc arrondi en haut à gauche (« Hôtel à la une », « Coup de cœur voyageurs »), cœur en haut à droite, points de carrousel en bas de la photo. Dessous : titre (15 px, graisse 500) et note à droite (« ★ 4,37 (436) »), type et lieu en gris, **prix total** souligné de graisse supérieure (« 461 € au total »), une ligne verte de crédit. Pas de bordure, pas d'ombre : la photo porte la carte.
- Texte courant : `#222`, police maison « Airbnb Cereal VF » avec repli système.

### Fiche d'annonce [Vu]

- Titre de l'annonce (26 px, graisse 500, interligne 30 px) **au-dessus** de la galerie, avec « Partager » et « Enregistrer » en liens à droite.
- **Galerie en mosaïque** : une grande image (560 × 476 px) et quatre images (272 × ~234 px) en 2 × 2, gouttière de 8 px. Un bouton « Afficher toutes les photos » sur le dernier cadre.
- Navigation d'ancres : « Photos », « Chambres », « Équipements », « Commentaires », « Emplacement ».
- Colonne droite : **carte de réservation collante** (`position: sticky`, 373 px de large) dont le titre est « Indiquez vos dates pour afficher les prix », puis champs ARRIVÉE / DÉPART / VOYAGEURS. Tant que les dates manquent, aucun prix n'est affiché : la carte demande l'action avant de promettre un chiffre.
- Note et nombre d'avis sous le titre, en lien vers les commentaires (« 4,43 · 424 commentaires »).
- « Visite photo » : écran plein page, bouton retour, aperçu de vignettes **groupées par pièce avec légende** (« Vue d'ensemble », « Eklo Classique »…), puis grandes images à défiler. Ce n'est pas une lightbox noire.
- Sections « Mise en avant des annonces » (trois points forts courts) et « Choisissez votre chambre » (cartes avec « 1 lit double · 2 voyageurs · 11 pi² »).

## 3. Dix à quatorze principes

Chaque principe : observation, source, traduction pour MakomSpace. Les « traductions » sont des propositions.

**P1. La photo porte la carte.**
Observation : annonce sans bordure ni ombre, photo plein cadre, angles très arrondis, informations en trois lignes sous l'image [Vu, résultats Airbnb]. Source : https://www.airbnb.fr/s/Lyon--France/homes.
Traduction : carte d'espace = photo d'abord (4:3), rayon 16 px, aucune bordure ni ombre au repos. Le nom, la ville, la capacité et le prix tiennent en trois lignes. Fin des cartes avec cadre, pastille d'icône et pied de carte.

**P2. Le prix se montre comme il sera payé.**
Observation : « 461 € au total », « Prix indiqués taxes et frais inclus » [Vu]. Source : même page.
Traduction : afficher le prix du créneau choisi, TTC, avec l'unité (« demi-journée », « journée »). Une ligne « Commission et TVA comprises » rassure et évite la surprise au paiement. Le calcul reste côté serveur (aucune règle de prix ne change dans ce chantier).

**P3. Galerie en mosaïque, puis visite photo légendée.**
Observation : mosaïque 1 + 4, gouttière 8 px, bouton « Afficher toutes les photos », visite plein écran groupée par pièce avec légendes [Vu]. Source : https://www.airbnb.fr/rooms/1693437816585792989. Baymard indique que l'interface d'une galerie peut faire passer à côté des images que l'utilisateur cherchait, et que 40 % des sites tronquent les vignettes sans signaler qu'il en reste [Source tierce : https://baymard.com/product-page/benchmark/page-designs/image-gallery-overlay].
Traduction : mosaïque sur la fiche, bouton visible avec le nombre de photos, visite plein écran, légendes par zone (« Salle de réunion », « Accueil », « Entrée »). Sur mobile : un carrousel plein largeur avec compteur « 1 / 8 ».

**P4. Un seul geste d'achat, collant, qui demande l'action avant le prix.**
Observation : carte sticky de 373 px, champs de dates et de voyageurs, titre invitant à saisir les dates [Vu].
Traduction : carte de réservation collante en colonne droite (créneau, nombre de personnes, bouton « Réserver »). Sur mobile, barre fixe en bas avec « à partir de … » et un bouton.

**P5. La recherche tient dans une pilule qui se réduit.**
Observation : pilule 46 px, rayon 40, ombre à deux couches faibles, segments séparés par des filets, bouton rond d'action ; version compacte dans l'en-tête des pages internes [Vu].
Traduction : « Où », « Quand », « Combien de personnes » dans une pilule unique, avec bouton marine rond. L'état compact se réutilise sur les résultats et la fiche.

**P6. Les filtres sont des pastilles, pas un formulaire.**
Observation : rangée de pastilles défilante, bouton « Filtres » avec icône, filtres fréquents exposés directement (« Wifi », « Parking gratuit ») [Vu].
Traduction : pastilles pour type d'espace, capacité, équipements les plus demandés (écran, visioconférence, accessibilité), et un panneau « Filtres » pour le reste.

**P7. Une seule couleur d'action, tout le reste est neutre.**
Observation : texte `#222` sur blanc, un seul accent rouge pour le bouton de recherche [Vu]. Une reconstruction communautaire parle d'un accent unique et d'une ombre à trois couches (valeurs non officielles) [Source tierce : https://getdesign.md/design-md/airbnb/preview.html].
Traduction : le marine #041627 est l'encre et la couleur d'action. L'or n'apparaît qu'en signature (porte du logo, un filet, un badge). Jamais d'or comme couleur de texte courant sur fond clair (la charte impose déjà #86672a pour cela).

**P8. La confiance se prouve avec ce qui est vérifiable, pas avec des chiffres.**
Observation : Croissant affiche « Trusted by over 5,000 companies » et des pourcentages d'économies [Texte : https://www.getcroissant.com/]. Industrious cite cinq avis à cinq étoiles liés à des fiches Google Maps [Texte : https://www.industriousoffice.com/]. Mobbin rappelle lui-même que ses chiffres sont des déclarations de l'éditeur [Texte : https://mobbin.com/].
Traduction : MakomSpace n'a pas de volume à afficher. Les preuves possibles sont structurelles : « Entreprise vérifiée » (SIRET contrôlé), photos contrôlées, paiement sécurisé par un prestataire agréé, coordonnées de l'hôte révélées après réservation, politique d'annulation écrite. Aucun chiffre, aucune note, aucun témoignage tant qu'ils ne sont pas réels.

**P9. Titres affirmatifs et courts, verbes d'action sur les boutons.**
Observation : « Search, book, and check-in instantly » (Deskpass), « Reserve Space Now » [Texte : https://deskpass.com/]. « Banking's been a headache. Now, it's a head start. » (Mercury) [Texte : https://mercury.com/]. « Get started » sans carte bancaire (Cal.com) [Texte : https://cal.com/].
Traduction : des titres qui disent la situation du locataire (« Recevez vos clients dans un vrai espace professionnel ») et des boutons qui disent l'action (« Voir les disponibilités », « Envoyer la demande »). Retrait des formules creuses.

**P10. Le produit se montre par ses propres éléments, pas par des illustrations.**
Observation : Cal.com illustre avec de vrais fragments d'interface (lien de profil, durées de rendez-vous) ; Linear avec une capture d'application ; Stripe avec des photos en contexte réel et des cartes « bento » [Texte : https://cal.com/, https://linear.app/, https://stripe.com/fr].
Traduction : côté bailleur, montrer la vraie carte d'espace, le vrai calendrier, la vraie ligne de revenu. Aucune illustration vectorielle générique.

**P11. Un seul mouvement orchestré, le reste répond au geste.**
Observation : critique récurrente des animations identiques sur chaque section [Source tierce : https://capitalandcompute.net/blog/fix-ai-slop-design/].
Traduction : une entrée sobre pour le hero, des transitions de 150 à 200 ms sur survol et focus, un déplacement de la carte de réservation. Respect de `prefers-reduced-motion`. Le dépôt dispose déjà de `motion` : on l'utilise avec parcimonie.

**P12. Les états que personne ne regarde font la qualité perçue.**
Observation : critique des interfaces générées sans validation, sans états d'erreur, sans champs obligatoires signalés [Source tierce : https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website]. Mobbin range explicitement états vides, dialogues et formulaires comme motifs à étudier [Texte : https://mobbin.com/].
Traduction : chaque liste a un état vide qui propose une sortie, chaque formulaire des erreurs en ligne, chaque chargement un squelette de la forme réelle.

**P13. Un seul vocabulaire d'icônes, à trait fin, sans pastille.**
Observation : la rangée de catégories d'Airbnb utilise des vignettes illustrées avec libellé, mais le reste de l'interface emploie des icônes de trait [Texte : https://www.airbnb.fr/ ; Vu pour cœur, partage, cœur de carte].
Traduction : lucide-react (déjà installé), trait 1,5 px, taille 20 px, **sans cercle coloré derrière**. Une icône sert à repérer, jamais à décorer.

**P14. Les sections de page ne sont pas symétriques par défaut.**
Observation : la page d'accueil d'Industrious alterne offres, logos, arguments, avis et presse, sans grille de trois cartes identiques répétée [Texte : https://www.industriousoffice.com/]. La critique du « kit de cartes » (rayon unique, ombre unique, cartes imbriquées) est un constat partagé [Source tierce : https://capitalandcompute.net/blog/fix-ai-slop-design/].
Traduction : varier la composition d'une section à l'autre (une section pleine largeur sur photo, une section texte et liste, une rangée de cartes d'espaces réelles), au lieu de répéter trois cartes.

## 4. Les signes qui trahissent un design généré par IA

Synthèse des deux articles lus (sources tierces, constats de praticiens, pas des mesures) :

1. Police par défaut (Inter ou Roboto) partout, sans police d'affichage ni échelle.
2. Dégradé violet ou indigo vers bleu, souvent sur le titre.
3. Ordre de page standard : hero centré, pastille, deux boutons, rangée de logos, trois cartes à icône, tarifs, appel à l'action.
4. Kit de cartes : même rayon, même ombre douce partout, cartes imbriquées.
5. Effet de verre (`backdrop-blur`) sans raison.
6. Le même fondu avec glissement sur chaque section, compteurs animés.
7. Texte de remplissage, chiffres inventés.
8. « Seconde vague » : crème + serif d'affichage + accent terracotta ; quasi-noir + un accent vif ; cosplay de journal ; étiquettes en capitales espacées, numérotation 01/02/03 sans séquence réelle, flèche « → » sur chaque lien.
9. Lacunes fonctionnelles : pas de validation, pas d'états d'erreur, accessibilité négligée.

Conséquence pour nous : remplacer un défaut par un autre n'est pas un remède. La direction retenue doit découler du produit (espaces de travail réels, entreprises vérifiées) et non d'un style à la mode. L'article précise que ces traits restent légitimes pour certains briefs : ce sont des défauts lorsqu'ils ne sont pas choisis.

## 5. Trois directions artistiques

Contrainte commune : garder le nom, le logo « M » marine à porte dorée, la charte « Executive Fluidity » (marine #041627, or #c5a059, texte or sur fond clair #86672a). On peut affiner, pas remplacer.

### Direction A — « Marine et lumière » (recommandée)

Photo d'abord, beaucoup d'air, marine comme encre, or en signature minuscule.

| Élément | Choix |
|---|---|
| Fond | Blanc `#ffffff` pour les pages publiques. Gris très clair `#f6f7f9` réservé aux espaces connectés (aujourd'hui `#f8f9fa`). |
| Encre | Marine `#041627` pour titres et texte principal, gris ardoise `#5b6779` pour le secondaire (déjà validé à 5,4:1). |
| Action | Bouton principal marine plein, survol `#0c2d47`. |
| Or | `#c5a059` uniquement en signature : porte du logo, filet de 2 px, badge « Entreprise vérifiée ». Texte or sur clair : `#86672a`. |
| Couleur d'état | Succès vert profond `#1f6f50`, alerte `#9a5b00`, erreur `#b42318`. Tous contrôlés à 4,5:1 sur blanc. |
| Typographie | Conserver Plus Jakarta Sans (titres) et Inter (corps), déjà locales. Changer l'usage : titres en 600 avec interlettrage resserré, corps en 400/500, chiffres tabulaires pour les prix, échelle limitée à 6 tailles. |
| Rayons | Trois valeurs seulement : 8 px (champs, boutons), 16 px (cartes et photos), pilule 999 px (recherche, filtres, badges). Fin du « tout en rounded-2xl ». |
| Ombres | Deux niveaux : repos (aucune, bordure 1 px `#e6e8ec` sur surfaces) et flottant (`0 1px 2px rgba(4,22,39,.08), 0 8px 24px rgba(4,22,39,.08)`) pour menus, carte collante, modales. |
| Photo | Lumière naturelle, plans larges de l'espace tel qu'il est, personnes absentes ou de dos, cadrage 4:3. Séance chez les bailleurs (lot 5). Pas de banque d'images. |
| Mouvement | 150 à 200 ms, courbe `cubic-bezier(.2,.7,.2,1)`, survol de carte (photo +2 % d'échelle), transitions de la carte collante, apparition du hero. Réduit si `prefers-reduced-motion`. |
| Risque | Peut paraître sobre. La différenciation vient de la photo réelle et de la microcopy, d'où le lot 5. |

### Direction B — « Atelier éditorial »

Papier chaud `#f5f1e8`, titres en serif d'affichage, filets or, cartes sans arrondi marqué.

- Atouts : identité reconnaissable, ton « cabinet ».
- Risques : c'est précisément la « seconde vague » décrite par la critique (crème + serif + accent chaud). Les polices serif demandent un nouveau fichier local et un budget de performance. Les espaces connectés (tableaux denses) souffrent du serif.
- À ne retenir que si l'on assume un positionnement haut de gamme éditorial.

### Direction C — « Nuit dorée »

Surfaces marine dominantes, or vif, contraste élevé.

- Atouts : très « Executive », cohérent avec le thème sombre déjà présent dans le hero actuel.
- Risques : les photos d'espaces claires s'y marient mal, l'or en petit texte échoue à l'accessibilité sur clair, la lecture longue (fiche, factures) fatigue. Ressemble à la signature « quasi-noir + un accent vif » citée comme défaut courant.
- À réserver à des surfaces ponctuelles (pied de page, bandeau bailleur).

### Recommandation

Direction A. Elle respecte la charte, réutilise les polices déjà locales (aucun coût de performance), et met la photo réelle au centre, ce qui est le vrai différenciateur face aux concurrents qui standardisent leurs lieux. Le principal risque (sobriété) se traite par le contenu, pas par la décoration.

## 6. Ce qu'on ne fera pas

1. Aucun dégradé violet, indigo ou bleu-violet, aucun texte en dégradé.
2. Aucun effet de verre ou flou d'arrière-plan décoratif.
3. Aucune pastille d'icône colorée (cercle, carré arrondi) derrière les icônes.
4. Aucune grille de trois cartes identiques « icône, titre, texte » comme section de preuve.
5. Aucun hero centré avec pastille « Nouveau » au-dessus du titre.
6. Aucun emoji dans l'interface, les e-mails ni les messages d'erreur.
7. Aucun chiffre, note, avis, témoignage ou logo de client fictif, y compris dans les maquettes. Ne pas non plus afficher de note « 0 » ni d'étoiles vides.
8. Aucune image générée par IA, aucune photo de banque d'images présentée comme un espace réel de la plateforme.
9. Aucun libellé « Photo à venir » exposé à un visiteur : un espace sans photo n'est pas publié, ou son état est traité par un cadre sobre côté bailleur uniquement.
10. Aucun rayon unique ni ombre unique répétés partout.
11. Aucune étiquette en capitales espacées au-dessus de chaque titre, aucune numérotation 01/02/03 hors vraie séquence, aucune flèche « → » systématique sur les liens.
12. Aucune animation identique sur chaque section, aucun compteur animé, aucun défilement détourné.
13. Aucune couleur terracotta, aucun fond crème : on ne remplace pas un défaut par le suivant.
14. Aucune règle de prix, de commission, d'autorisation ou de paiement modifiée dans une PR de design.
