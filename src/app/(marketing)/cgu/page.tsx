import { LegalPage, Section, Sub, ToFill } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Conditions générales d'utilisation — OfficeFlex",
  description: "Règles d'accès et d'usage de la plateforme OfficeFlex.",
};

export default function CguPage() {
  return (
    <LegalPage
      title="Conditions générales d'utilisation"
      intro="Elles régissent l'accès à la plateforme et son usage. Les conditions de la transaction elle-même figurent dans les conditions générales de vente."
    >
      <Section title="1. Objet et acceptation">
        <p>
          OfficeFlex est une plateforme de mise en relation entre des entreprises
          disposant d&apos;espaces professionnels inoccupés (les « Partenaires ») et
          des professionnels souhaitant les réserver ponctuellement (les « Clients »).
        </p>
        <p>
          La création d&apos;un compte vaut acceptation pleine et entière des présentes
          conditions. L&apos;utilisateur qui ne les accepte pas doit renoncer à
          utiliser la plateforme.
        </p>
      </Section>

      <Section title="2. Qualité d'intermédiaire — ce qu'OfficeFlex n'est pas">
        <p>
          OfficeFlex agit exclusivement en qualité d&apos;intermédiaire technique de
          mise en relation. La plateforme :
        </p>
        <ul className="list-disc pl-5">
          <li>
            n&apos;est ni propriétaire, ni locataire, ni exploitant, ni gestionnaire
            des espaces proposés ;
          </li>
          <li>
            n&apos;est pas partie au contrat de mise à disposition conclu entre le
            Client et le Partenaire, dont elle n&apos;est que le facilitateur ;
          </li>
          <li>
            n&apos;est ni une agence immobilière au sens de la loi Hoguet, ni un
            opérateur de coworking, ni un hébergeur au sens hôtelier ;
          </li>
          <li>
            ne garantit ni la conformité, ni la disponibilité effective, ni la qualité
            des espaces, qui relèvent de la seule responsabilité du Partenaire.
          </li>
        </ul>
        <p>
          S&apos;agissant des contenus publiés par les utilisateurs, OfficeFlex relève
          du régime de responsabilité limitée des prestataires intermédiaires (article
          6-I-2 de la LCEN et articles 4 à 6 du règlement sur les services numériques).
          Sa responsabilité ne peut être engagée qu&apos;à défaut d&apos;avoir agi
          promptement pour retirer un contenu manifestement illicite après en avoir eu
          connaissance effective.
        </p>
      </Section>

      <Section title="3. Un service strictement entre professionnels">
        <p>
          La plateforme est réservée aux personnes morales et aux personnes physiques
          agissant à des fins entrant dans le cadre de leur activité professionnelle.
          Elle n&apos;est pas destinée aux consommateurs.
        </p>
        <p>
          En conséquence, et sauf disposition impérative contraire, les règles du Code
          de la consommation propres aux relations entre professionnels et
          consommateurs — en particulier le droit de rétractation de quatorze jours —
          ne trouvent pas à s&apos;appliquer. L&apos;utilisateur déclare agir à titre
          professionnel et garantit OfficeFlex contre toute conséquence d&apos;une
          déclaration inexacte sur ce point.
        </p>
      </Section>

      <Section title="4. Comptes et vérification">
        <Sub title="4.1 Création">
          <p>
            L&apos;ouverture d&apos;un compte suppose la communication
            d&apos;informations exactes et à jour. Chaque utilisateur est responsable
            de la confidentialité de ses identifiants et de toute action effectuée
            depuis son compte.
          </p>
        </Sub>
        <Sub title="4.2 Vérification des entreprises partenaires">
          <p>
            Avant la publication d&apos;une annonce, OfficeFlex procède à des
            vérifications sur l&apos;entreprise partenaire : numéro SIRET, adresse
            professionnelle, adresse électronique professionnelle et, le cas échéant,
            pièces justificatives complémentaires. Ces vérifications constituent une
            obligation de moyens et non de résultat, et répondent notamment à
            l&apos;article 30 du règlement sur les services numériques relatif à la
            traçabilité des professionnels.
          </p>
          <p>
            OfficeFlex peut refuser, suspendre ou retirer une annonce dont les
            informations se révèlent inexactes, incomplètes ou invérifiables.
          </p>
        </Sub>
        <Sub title="4.3 Suspension et résiliation">
          <p>
            OfficeFlex peut suspendre ou clôturer un compte en cas de manquement aux
            présentes conditions, de fraude, d&apos;impayé, de comportement portant
            atteinte à la sécurité des personnes ou des biens, ou d&apos;atteinte à la
            réputation de la plateforme.
          </p>
          <p>
            Conformément à l&apos;article 4 du règlement (UE) 2019/1150, toute
            restriction, suspension ou résiliation visant un Partenaire est notifiée
            avec un exposé des motifs, en principe trente jours avant sa prise
            d&apos;effet pour une résiliation. Ce préavis ne s&apos;applique pas
            lorsque la mesure répond à une obligation légale, à une fraude
            caractérisée ou à une atteinte grave et répétée.
          </p>
        </Sub>
      </Section>

      <Section title="5. Obligations des Partenaires">
        <ul className="list-disc pl-5">
          <li>
            Décrire l&apos;espace de manière exacte, loyale et complète : surface,
            capacité, équipements, contraintes d&apos;accès, photographies fidèles et
            à jour.
          </li>
          <li>
            Disposer de tous les droits nécessaires pour mettre l&apos;espace à
            disposition, notamment au regard de son bail, du règlement de copropriété,
            de son assurance et, le cas échéant, de l&apos;accord de son bailleur.
          </li>
          <li>
            Respecter les règles de sécurité applicables aux locaux, notamment celles
            relatives aux établissements recevant du public lorsqu&apos;elles
            s&apos;appliquent.
          </li>
          <li>
            Maintenir un calendrier de disponibilité sincère et honorer les
            réservations acceptées.
          </li>
          <li>
            Souscrire et maintenir une assurance responsabilité civile professionnelle
            couvrant la mise à disposition ponctuelle de ses locaux à des tiers.
          </li>
          <li>
            Ne pas solliciter les Clients rencontrés via la plateforme afin de
            contracter en dehors de celle-ci pendant la durée du compte et les douze
            mois suivant sa clôture.
          </li>
        </ul>
      </Section>

      <Section title="6. Obligations des Clients">
        <ul className="list-disc pl-5">
          <li>Utiliser l&apos;espace conformément à sa destination professionnelle.</li>
          <li>
            Respecter les lieux, le règlement intérieur communiqué et les consignes de
            sécurité ; restituer l&apos;espace dans son état d&apos;origine.
          </li>
          <li>
            Ne pas dépasser la capacité annoncée ni sous-louer, prêter ou céder la
            réservation.
          </li>
          <li>
            Disposer d&apos;une assurance responsabilité civile professionnelle
            couvrant les dommages causés à l&apos;occasion de l&apos;occupation.
          </li>
          <li>
            Ne pas contourner la plateforme pour contracter directement avec un
            Partenaire rencontré par son intermédiaire, dans les mêmes conditions de
            durée que celles prévues à l&apos;article 5.
          </li>
        </ul>
      </Section>

      <Section title="7. Contenus publiés">
        <p>
          Chaque utilisateur garantit détenir les droits sur les contenus qu&apos;il
          publie et concède à OfficeFlex, à titre gratuit et non exclusif, le droit de
          les reproduire, représenter et adapter aux seules fins de leur diffusion sur
          la plateforme et de sa promotion, pour la durée de publication de
          l&apos;annonce et douze mois au-delà, dans le monde entier.
        </p>
        <p>
          Sont notamment interdits : les contenus mensongers, diffamatoires, portant
          atteinte à la vie privée ou aux droits de tiers, discriminatoires, ainsi que
          toute donnée à caractère personnel de tiers publiée sans base légale.
          OfficeFlex peut retirer sans préavis un contenu manifestement illicite et en
          informe l&apos;auteur avec les motifs et les voies de recours.
        </p>
      </Section>

      <Section title="8. Classement des annonces">
        <p>
          Conformément à l&apos;article 5 du règlement (UE) 2019/1150, les principaux
          paramètres déterminant l&apos;ordre d&apos;affichage des annonces sont, par
          ordre d&apos;importance décroissante : la correspondance avec les critères de
          recherche saisis (localisation, date, capacité, équipements), la
          disponibilité réelle du créneau demandé, la complétude de l&apos;annonce, la
          réactivité du Partenaire aux demandes reçues, puis la date de publication.
        </p>
        <p>
          Aucune rémunération directe ou indirecte ne permet, à ce jour, d&apos;influer
          sur ce classement. Toute évolution de cette règle sera communiquée
          préalablement dans les conditions prévues à l&apos;article 13.
        </p>
      </Section>

      <Section title="9. Disponibilité du service">
        <p>
          OfficeFlex s&apos;engage à mettre en œuvre les moyens raisonnables pour
          assurer l&apos;accessibilité de la plateforme, sans garantie
          d&apos;absence d&apos;interruption. Des opérations de maintenance peuvent
          survenir, en principe annoncées à l&apos;avance lorsqu&apos;elles sont
          programmées.
        </p>
      </Section>

      <Section title="10. Responsabilité">
        <p>
          OfficeFlex ne répond pas des dommages résultant de la relation entre un
          Client et un Partenaire, notamment de la non-conformité, de
          l&apos;indisponibilité ou de l&apos;état d&apos;un espace, des dommages
          causés aux locaux ou aux personnes, ni des vols et pertes d&apos;effets
          personnels.
        </p>
        <p>
          Dans la limite permise par la loi, et hors faute lourde ou dolosive, la
          responsabilité d&apos;OfficeFlex, toutes causes confondues, est plafonnée au
          montant des commissions effectivement perçues au titre des réservations
          concernées au cours des douze mois précédant le fait générateur. Sont exclus
          les dommages indirects, notamment la perte de chiffre d&apos;affaires, de
          clientèle, de données ou d&apos;image.
        </p>
        <p>
          Chaque utilisateur garantit OfficeFlex contre toute réclamation de tiers
          résultant de son propre manquement aux présentes conditions.
        </p>
      </Section>

      <Section title="11. Force majeure">
        <p>
          Aucune partie ne peut être tenue responsable d&apos;un manquement causé par
          un événement de force majeure au sens de l&apos;article 1218 du Code civil,
          y compris une défaillance généralisée des réseaux de communication ou des
          services d&apos;un prestataire technique essentiel.
        </p>
      </Section>

      <Section title="12. Réclamations, médiation et litiges">
        <Sub title="12.1 Traitement interne des réclamations">
          <p>
            Toute réclamation peut être adressée à{" "}
            <ToFill>adresse e-mail de réclamation</ToFill>. OfficeFlex accuse réception
            sous cinq jours ouvrés et apporte une réponse motivée dans un délai
            raisonnable, conformément à l&apos;article 11 du règlement (UE) 2019/1150.
          </p>
        </Sub>
        <Sub title="12.2 Médiation">
          <p>
            À défaut d&apos;accord, les Partenaires peuvent recourir au médiateur
            suivant : <ToFill>médiateur désigné</ToFill>. Les entreprises peuvent
            également saisir le médiateur des entreprises. Le recours à la médiation
            est facultatif et sans préjudice de toute action judiciaire.
          </p>
        </Sub>
        <Sub title="12.3 Droit applicable et juridiction">
          <p>
            Les présentes conditions sont soumises au droit français. À défaut de
            résolution amiable, tout litige relève de la compétence exclusive des
            tribunaux du ressort de <ToFill>ville du siège</ToFill>, y compris en cas
            de pluralité de défendeurs ou d&apos;appel en garantie.
          </p>
        </Sub>
      </Section>

      <Section title="13. Modification des conditions">
        <p>
          OfficeFlex peut modifier les présentes conditions. Toute modification est
          notifiée aux Partenaires au moins quinze jours avant son entrée en vigueur,
          conformément à l&apos;article 3 du règlement (UE) 2019/1150, sauf lorsque la
          modification répond à une obligation légale. La poursuite de
          l&apos;utilisation après cette date vaut acceptation.
        </p>
      </Section>

      <Section title="14. Données personnelles">
        <p>
          Le traitement des données personnelles est décrit dans la politique de
          confidentialité, qui fait partie intégrante des présentes conditions.
        </p>
      </Section>
    </LegalPage>
  );
}
