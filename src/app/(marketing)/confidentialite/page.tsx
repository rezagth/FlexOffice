import Link from "next/link";
import { LegalPage, Section, Sub, ToFill } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Politique de confidentialité — MakomSpace",
  description:
    "Données collectées, finalités, durées de conservation et droits des personnes.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Elle décrit les traitements de données personnelles mis en œuvre par MakomSpace, conformément au règlement général sur la protection des données."
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
            Le mot de passe n&apos;est jamais accessible à MakomSpace : il est traité
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
              MakomSpace
            </strong>{" "}
            : la saisie et le traitement relèvent exclusivement d&apos;un prestataire
            agréé et certifié PCI-DSS.
          </p>
        </Sub>
        <Sub title="2.5 Données techniques">
          <p>
            Journaux de connexion et d&apos;activité, adresse IP, horodatages et
            événements d&apos;audit relatifs aux actions sensibles, conservés à des
            fins de sécurité et de preuve. En cas d&apos;erreur technique, un rapport
            (page concernée, message d&apos;erreur, navigateur) est enregistré pour
            permettre la correction.
          </p>
        </Sub>
        <Sub title="2.6 Facturation">
          <p>
            Pour chaque réservation payée, une facture est émise au nom du Partenaire
            (mandat de facturation) et conserve les nom, adresse électronique et, le cas
            échéant, entreprise du Client, ainsi que l&apos;identité légale du Partenaire
            (raison sociale, SIRET, numéro de TVA, adresse) telles qu&apos;elles étaient au
            jour de l&apos;émission.
          </p>
        </Sub>
        <Sub title="2.7 Vérification des Partenaires">
          <p>
            Pièces justificatives transmises pour la vérification de l&apos;entreprise et
            de son représentant (extrait Kbis, pièce d&apos;identité, justificatif de droit
            sur les locaux).
          </p>
        </Sub>
        <Sub title="2.8 Recherches et mesure d&apos;audience">
          <p>
            Statistiques de recherche sans identifiant de compte (ville recherchée, usage de
            la géolocalisation, nombre de résultats). Mesure d&apos;audience agrégée sans
            cookie (Umami). Données d&apos;utilisation des fonctionnalités (PostHog)
            uniquement si vous l&apos;avez accepté.
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
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Émettre les factures et avoirs au nom des Partenaires (mandat de
                  facturation) et les factures de commission
                </td>
                <td className="border-b border-border py-2">
                  Obligation légale (art. 6.1.c) et exécution du contrat (art. 6.1.b)
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Mesurer l&apos;audience de façon agrégée, sans cookie, et corriger les
                  erreurs techniques
                </td>
                <td className="border-b border-border py-2">
                  Intérêt légitime à faire fonctionner et améliorer le service (art. 6.1.f)
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  Analyser l&apos;usage des fonctionnalités (PostHog)
                </td>
                <td className="border-b border-border py-2">
                  Consentement (art. 6.1.a), retirable à tout moment
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
            Compte : pendant toute la durée de son existence. Vous pouvez le supprimer à tout
            moment depuis votre profil ; les données de prospection éventuelles sont
            conservées trois ans à compter du dernier contact.
          </li>
          <li>
            Réservations, paiements, factures et avoirs : dix ans à compter de la clôture de
            l&apos;exercice, conformément à l&apos;article L.123-22 du Code de commerce.
            Après suppression d&apos;un compte, ces pièces sont conservées sous forme
            détachée du compte (voir article 8).
          </li>
          <li>
            Pièces de vérification des Partenaires : douze mois après la décision de
            vérification, puis suppression.
          </li>
          <li>Journaux des notifications reçues du prestataire de paiement : quatre-vingt-dix jours.</li>
          <li>Statistiques de recherche : treize mois.</li>
          <li>Rapports d&apos;erreurs techniques : quatre-vingt-dix jours.</li>
          <li>Journaux de connexion et d&apos;audit : douze mois.</li>
          <li>
            Éléments d&apos;un litige : jusqu&apos;à l&apos;expiration des voies de
            recours.
          </li>
        </ul>
      </Section>

      <Section title="5. Destinataires et sous-traitants">
        <p>
          Les données sont accessibles aux seules personnes habilitées de MakomSpace.
          L&apos;hébergement est assuré en France sur un serveur dédié exploité par
          l&apos;éditeur lui-même : la base de données, l&apos;authentification et le
          stockage des fichiers (logiciel libre Supabase, installé et exploité par nos
          soins), la mesure d&apos;audience (Umami) et le suivi des erreurs (GlitchTip)
          fonctionnent sur ce serveur, sans prestataire tiers. Les sous-traitants suivants
          sont liés par un accord conforme à l&apos;article 28 du RGPD :
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Cloudflare, Inc.</strong> (États-Unis) — réseau de diffusion de contenu,
            protection contre les attaques et acheminement chiffré du trafic vers notre
            serveur.
          </li>
          <li>
            <strong>Stripe Payments Europe, Limited</strong> (Dublin, Irlande) — traitement
            des paiements, des remboursements et des reversements aux Partenaires, en qualité
            de responsable de traitement autonome pour ses obligations réglementaires propres
            (connaissance du client, lutte contre le blanchiment).
          </li>
          <li>
            <strong>Resend</strong> (Resend, Inc., États-Unis) — envoi des e-mails liés au
            compte et aux réservations.
          </li>
          <li>
            <strong>PostHog</strong> (instance hébergée dans l&apos;Union européenne) —
            analyse de l&apos;usage des fonctionnalités, <strong>uniquement</strong> si vous y
            avez consenti.
          </li>
        </ul>
        <p>
          Certaines données sont partagées entre utilisateurs pour permettre la
          prestation : le Partenaire reçoit le nom du Client et le motif de la
          réservation, ainsi que les éléments figurant sur la facture émise en son nom ; le
          Client reçoit, après confirmation, l&apos;adresse exacte et les instructions
          d&apos;accès. Aucune donnée n&apos;est vendue ni louée.
        </p>
      </Section>

      <Section title="6. Transferts hors Union européenne">
        <p>
          Les données sont stockées en France. Cloudflare et Resend sont des sociétés
          établies aux États-Unis susceptibles d&apos;accéder à certaines données
          (requêtes en transit, adresse électronique des destinataires) : ces transferts
          sont encadrés par la décision d&apos;adéquation de la Commission européenne du
          10 juillet 2023 (Data Privacy Framework), auquel ces sociétés adhèrent, et à
          défaut par les clauses contractuelles types de la Commission européenne. La liste
          à jour des sous-traitants est disponible sur demande.
        </p>
      </Section>

      <Section title="7. Sécurité">
        <p>
          Chiffrement des échanges en transit, hébergement sur un serveur dédié dont
          l&apos;accès est restreint, cloisonnement des accès par rôle, contrôle d&apos;accès au niveau de
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
          Lorsque le traitement repose sur votre consentement (analyse produit), vous
          pouvez le retirer à tout moment depuis la page{" "}
          <Link href="/cookies" className="underline">
            gestion des cookies
          </Link>
          , sans que cela affecte la licéité du traitement effectué avant ce retrait.
        </p>
        <p>
          Pour les autres droits, écrivez à <ToFill>adresse e-mail dédiée</ToFill>. Une
          réponse est apportée dans un délai d&apos;un mois, prolongeable de deux mois
          en cas de complexité. Un justificatif d&apos;identité peut être demandé en cas
          de doute raisonnable sur l&apos;identité du demandeur.
        </p>
        <p>
          Vous pouvez introduire une réclamation auprès de la Commission nationale de
          l&apos;informatique et des libertés (CNIL), 3 place de Fontenoy, TSA 80715,
          75334 Paris Cedex 07, ou en ligne sur www.cnil.fr.
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
