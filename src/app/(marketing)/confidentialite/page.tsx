import { LegalPage, Section, Sub, ToFill } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Politique de confidentialité — OfficeFlex",
  description:
    "Données collectées, finalités, durées de conservation et droits des personnes.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Elle décrit les traitements de données personnelles mis en œuvre par OfficeFlex, conformément au règlement général sur la protection des données."
    >
      <Section title="1. Responsable du traitement">
        <p>
          Le responsable du traitement est <ToFill>raison sociale</ToFill>,{" "}
          <ToFill>adresse du siège</ToFill>. Toute question relative aux données
          personnelles peut être adressée à <ToFill>adresse e-mail dédiée</ToFill>.
        </p>
        <p>
          Délégué à la protection des données :{" "}
          <ToFill>coordonnées du DPO, ou « non désigné » si aucun n&apos;est requis</ToFill>.
        </p>
      </Section>

      <Section title="2. Données traitées">
        <Sub title="2.1 Compte">
          <p>
            Nom, adresse électronique, numéro de téléphone lorsqu&apos;il est fourni,
            rôle sur la plateforme, date de création du compte, identifiant technique.
            Le mot de passe n&apos;est jamais accessible à OfficeFlex : il est traité
            sous forme chiffrée par le service d&apos;authentification.
          </p>
        </Sub>
        <Sub title="2.2 Entreprise partenaire">
          <p>
            Dénomination sociale, numéro SIRET, adresse postale, adresse électronique
            professionnelle, statut de vérification, et le cas échéant identifiant du
            compte ouvert auprès du prestataire de paiement.
          </p>
        </Sub>
        <Sub title="2.3 Espaces et réservations">
          <p>
            Adresse et description des espaces, photographies, horaires, périodes de
            fermeture, instructions d&apos;accès, ainsi que pour chaque réservation :
            dates et horaires, nombre de participants, motif indiqué, montant et
            statut.
          </p>
        </Sub>
        <Sub title="2.4 Paiements">
          <p>
            Montants, commissions, statuts et identifiants de transaction.{" "}
            <strong>
              Aucune donnée de carte bancaire n&apos;est collectée ni conservée par
              OfficeFlex
            </strong>{" "}
            : la saisie et le traitement relèvent exclusivement d&apos;un prestataire
            agréé et certifié PCI-DSS.
          </p>
        </Sub>
        <Sub title="2.5 Données techniques">
          <p>
            Journaux de connexion et d&apos;activité, adresse IP, horodatages et
            événements d&apos;audit relatifs aux actions sensibles, conservés à des
            fins de sécurité et de preuve.
          </p>
        </Sub>
      </Section>

      <Section title="3. Finalités et bases légales">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-border py-2 pr-4 text-left font-medium">
                  Finalité
                </th>
                <th className="border-b border-border py-2 text-left font-medium">
                  Base légale
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Créer et gérer les comptes, permettre la mise en relation et la
                  réservation
                </td>
                <td className="border-b border-border py-2">
                  Exécution du contrat (art. 6.1.b)
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Traiter les paiements et les reversements
                </td>
                <td className="border-b border-border py-2">
                  Exécution du contrat (art. 6.1.b)
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Vérifier les entreprises partenaires et modérer les annonces
                </td>
                <td className="border-b border-border py-2">
                  Obligation légale (règlement sur les services numériques) et intérêt
                  légitime à la confiance (art. 6.1.c et 6.1.f)
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Envoyer les messages liés aux réservations
                </td>
                <td className="border-b border-border py-2">
                  Exécution du contrat (art. 6.1.b)
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Prévenir la fraude, assurer la sécurité, conserver des preuves
                </td>
                <td className="border-b border-border py-2">
                  Intérêt légitime (art. 6.1.f)
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Tenir la comptabilité et répondre aux obligations fiscales
                </td>
                <td className="border-b border-border py-2">
                  Obligation légale (art. 6.1.c)
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Traiter les litiges et réclamations
                </td>
                <td className="border-b border-border py-2">
                  Intérêt légitime et constatation d&apos;un droit en justice (art.
                  6.1.f et 9.2.f)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Aucune décision produisant des effets juridiques n&apos;est prise sur le seul
          fondement d&apos;un traitement automatisé, et aucun profilage publicitaire
          n&apos;est mis en œuvre.
        </p>
      </Section>

      <Section title="4. Durées de conservation">
        <ul className="list-disc pl-5">
          <li>
            Compte actif : pendant toute la durée de la relation, puis trois ans à
            compter du dernier contact pour les données de prospection.
          </li>
          <li>
            Réservations, paiements et factures : dix ans à compter de la clôture de
            l&apos;exercice, conformément à l&apos;article L.123-22 du Code de
            commerce.
          </li>
          <li>
            Pièces de vérification des entreprises : le temps strictement nécessaire à
            la vérification, puis suppression, sauf conservation exigée par le
            règlement sur les services numériques.
          </li>
          <li>
            Journaux de connexion et d&apos;audit : douze mois.
          </li>
          <li>
            Éléments d&apos;un litige : jusqu&apos;à l&apos;expiration des voies de
            recours.
          </li>
        </ul>
      </Section>

      <Section title="5. Destinataires et sous-traitants">
        <p>
          Les données sont accessibles aux personnes habilitées d&apos;OfficeFlex et
          aux sous-traitants suivants, liés par un accord conforme à l&apos;article 28
          du RGPD :
        </p>
        <ul className="list-disc pl-5">
          <li>
            <ToFill>fournisseur d&apos;authentification, de base de données et de stockage</ToFill>{" "}
            — hébergement des données et gestion des comptes, au sein de l&apos;Union
            européenne.
          </li>
          <li>
            <ToFill>hébergeur de l&apos;application</ToFill> — exécution du site.
          </li>
          <li>
            <ToFill>prestataire de paiement</ToFill> — traitement des paiements et
            reversements, en qualité de responsable de traitement autonome pour ses
            obligations réglementaires propres.
          </li>
          <li>
            <ToFill>prestataire d&apos;envoi d&apos;e-mails, une fois choisi</ToFill>.
          </li>
        </ul>
        <p>
          Certaines données sont partagées entre utilisateurs pour permettre la
          prestation : le Partenaire reçoit le nom du Client et le motif de la
          réservation ; le Client reçoit, après confirmation, l&apos;adresse exacte et
          les instructions d&apos;accès. Aucune donnée n&apos;est vendue ni louée.
        </p>
      </Section>

      <Section title="6. Transferts hors Union européenne">
        <p>
          L&apos;hébergement est réalisé au sein de l&apos;Union européenne. Si un
          sous-traitant devait traiter des données hors de l&apos;Union, le transfert
          serait encadré par une décision d&apos;adéquation ou par les clauses
          contractuelles types de la Commission européenne, assorties des mesures
          complémentaires nécessaires. La liste à jour est disponible sur demande.
        </p>
      </Section>

      <Section title="7. Sécurité">
        <p>
          Chiffrement des échanges en transit, chiffrement au repos des bases de
          données, cloisonnement des accès par rôle, contrôle d&apos;accès au niveau de
          chaque enregistrement, journalisation horodatée des actions sensibles,
          absence totale de stockage de données bancaires, et revue régulière des
          droits. Les incidents susceptibles de présenter un risque font l&apos;objet
          d&apos;une notification à l&apos;autorité de contrôle dans les 72 heures et,
          le cas échéant, aux personnes concernées.
        </p>
      </Section>

      <Section title="8. Vos droits">
        <p>
          Vous disposez des droits d&apos;accès, de rectification, d&apos;effacement,
          de limitation, d&apos;opposition et de portabilité, ainsi que du droit de
          définir des directives relatives au sort de vos données après votre décès.
        </p>
        <p>
          Deux de ces droits s&apos;exercent directement depuis votre profil :
          l&apos;<strong>export de vos données</strong> au format JSON, et la{" "}
          <strong>suppression de votre compte</strong>. Lorsque votre compte comporte
          un historique de réservations, celles-ci sont conservées pour répondre aux
          obligations comptables, mais vos données personnelles en sont détachées par
          anonymisation irréversible — application de l&apos;article 17.3.e du RGPD.
        </p>
        <p>
          Pour les autres droits, écrivez à <ToFill>adresse e-mail dédiée</ToFill>. Une
          réponse est apportée dans un délai d&apos;un mois, prolongeable de deux mois
          en cas de complexité. Vous pouvez introduire une réclamation auprès de la
          Commission nationale de l&apos;informatique et des libertés, 3 place de
          Fontenoy, 75007 Paris.
        </p>
      </Section>

      <Section title="9. Modification">
        <p>
          Cette politique peut évoluer. Toute modification substantielle est portée à
          la connaissance des utilisateurs avant son entrée en vigueur.
        </p>
      </Section>
    </LegalPage>
  );
}
