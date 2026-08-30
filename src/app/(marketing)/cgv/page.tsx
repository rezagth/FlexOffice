import { LegalPage, Section, Sub, ToFill } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Conditions générales de vente — OfficeFlex",
  description:
    "Réservation, prix, commission, paiement, annulation et litiges sur OfficeFlex.",
};

export default function CgvPage() {
  return (
    <LegalPage
      title="Conditions générales de vente"
      intro="Elles régissent les réservations conclues via la plateforme ainsi que le service d'intermédiation facturé par OfficeFlex."
    >
      <Section title="1. Champ d'application">
        <p>
          Les présentes conditions s&apos;appliquent à toute réservation d&apos;un
          espace effectuée sur la plateforme et à la commission due à ce titre. Elles
          complètent les conditions générales d&apos;utilisation et prévalent sur tout
          document contraire émanant d&apos;un utilisateur, notamment ses propres
          conditions d&apos;achat.
        </p>
        <p>
          Elles s&apos;appliquent exclusivement entre professionnels. Le droit de
          rétractation prévu par le Code de la consommation ne s&apos;applique pas.
        </p>
      </Section>

      <Section title="2. Deux contrats distincts">
        <p>Une réservation fait naître deux relations juridiques séparées :</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Le contrat de mise à disposition</strong>, conclu directement entre
            le Client et le Partenaire. OfficeFlex n&apos;y est pas partie. Il porte
            sur la mise à disposition temporaire d&apos;un espace, à l&apos;exclusion
            de tout bail commercial, professionnel ou d&apos;habitation, et
            n&apos;ouvre aucun droit au maintien dans les lieux ni à la propriété
            commerciale.
          </li>
          <li>
            <strong>Le contrat d&apos;intermédiation</strong>, conclu entre OfficeFlex
            et le Partenaire, rémunéré par la commission définie à l&apos;article 5.
          </li>
        </ul>
      </Section>

      <Section title="3. Formation de la réservation">
        <Sub title="3.1 Demande">
          <p>
            Le Client sélectionne un espace, une date et un créneau, puis transmet sa
            demande. Cette demande ne vaut pas réservation ferme : elle constitue une
            offre adressée au Partenaire.
          </p>
        </Sub>
        <Sub title="3.2 Autorisation de paiement">
          <p>
            Au moment de la demande, le moyen de paiement du Client fait
            l&apos;objet d&apos;une autorisation, sans débit immédiat. Les fonds ne
            sont pas prélevés tant que la demande n&apos;est pas acceptée.
          </p>
        </Sub>
        <Sub title="3.3 Acceptation">
          <p>
            Le contrat de mise à disposition est formé à l&apos;acceptation expresse de
            la demande par le Partenaire. Le paiement est alors capturé et une
            confirmation, comportant l&apos;adresse exacte et les instructions
            d&apos;accès, est adressée au Client.
          </p>
        </Sub>
        <Sub title="3.4 Refus et absence de réponse">
          <p>
            En cas de refus, l&apos;autorisation est libérée et aucun montant
            n&apos;est débité. Faute de réponse du Partenaire dans un délai de{" "}
            <ToFill>délai retenu, par défaut 48 heures</ToFill>, la demande est
            automatiquement annulée et l&apos;autorisation libérée, afin de ne pas
            immobiliser durablement le créneau ni les fonds du Client.
          </p>
        </Sub>
      </Section>

      <Section title="4. Prix">
        <p>
          Les prix sont exprimés en euros et fixés librement par le Partenaire pour la
          demi-journée et pour la journée. Le prix applicable est celui affiché au
          moment de la demande ; il est calculé par la plateforme à partir de la fiche
          de l&apos;espace et ne peut être modifié par le Client.
        </p>
        <p>
          Le Partenaire est seul responsable de la détermination de ses prix, de leur
          régime de TVA et de la facturation de la mise à disposition au Client. Il
          garantit OfficeFlex contre toute conséquence d&apos;un manquement à ses
          obligations fiscales.
        </p>
      </Section>

      <Section title="5. Commission">
        <p>
          OfficeFlex perçoit une commission de <ToFill>taux retenu, par défaut 15 %</ToFill>{" "}
          du montant de chaque réservation confirmée, en rémunération du service
          d&apos;intermédiation, de la mise en relation, de la sécurisation du
          paiement et de la mise à disposition des outils de gestion.
        </p>
        <p>
          La commission est déduite du montant reversé au Partenaire. Elle est acquise
          dès la confirmation de la réservation et reste due en cas d&apos;annulation
          imputable au Partenaire. Une facture de commission est mise à disposition du
          Partenaire dans son espace.
        </p>
      </Section>

      <Section title="6. Paiement et reversement">
        <p>
          Les paiements sont traités par un prestataire de services de paiement agréé.
          OfficeFlex ne collecte ni ne conserve aucune donnée de carte bancaire.
        </p>
        <p>
          Le reversement au Partenaire intervient après déduction de la commission,
          selon la périodicité indiquée dans son espace et sous réserve de la
          transmission des informations exigées par le prestataire de paiement au titre
          de ses obligations de connaissance du client et de lutte contre le
          blanchiment.
        </p>
        <p>
          En cas de retard de paiement d&apos;une somme due à OfficeFlex par un
          professionnel, sont exigibles de plein droit des pénalités calculées au taux
          d&apos;intérêt de la Banque centrale européenne majoré de dix points, ainsi
          qu&apos;une indemnité forfaitaire de recouvrement de quarante euros, sans
          préjudice de toute indemnisation complémentaire (articles L.441-10 et
          D.441-5 du Code de commerce).
        </p>
      </Section>

      <Section title="7. Annulation">
        <Sub title="7.1 Par le Client">
          <p>
            Conditions applicables, sauf mention contraire sur la fiche de
            l&apos;espace : annulation plus de{" "}
            <ToFill>délai, ex. 48 heures</ToFill> avant le début du créneau,
            remboursement intégral hors commission ; annulation moins de{" "}
            <ToFill>délai, ex. 48 heures</ToFill> avant, aucun remboursement, le
            créneau ayant été rendu indisponible pour d&apos;autres Clients.
          </p>
        </Sub>
        <Sub title="7.2 Par le Partenaire">
          <p>
            Le Partenaire qui annule une réservation confirmée expose son Client à un
            remboursement intégral immédiat. Les annulations répétées peuvent entraîner
            le déréférencement des annonces concernées et la suspension du compte, dans
            les conditions de préavis prévues aux conditions générales
            d&apos;utilisation.
          </p>
        </Sub>
        <Sub title="7.3 Force majeure">
          <p>
            En cas d&apos;événement de force majeure rendant l&apos;occupation
            impossible, la réservation est annulée et intégralement remboursée au
            Client, commission comprise, sans indemnité de part et d&apos;autre.
          </p>
        </Sub>
      </Section>

      <Section title="8. Non-conformité et litiges">
        <p>
          Le Client qui constate une non-conformité substantielle entre
          l&apos;annonce et l&apos;espace mis à disposition doit la signaler à
          OfficeFlex dans un délai de <ToFill>délai, ex. 48 heures</ToFill> suivant le
          début du créneau, en produisant les éléments justificatifs utiles.
        </p>
        <p>
          OfficeFlex instruit le signalement auprès des deux parties et peut, sans y
          être tenue et sans que cela vaille reconnaissance de responsabilité, décider
          d&apos;un remboursement total ou partiel prélevé sur les sommes dues au
          Partenaire. Chaque étape de l&apos;instruction est horodatée et conservée.
        </p>
        <p>
          Les dommages causés à l&apos;espace ou aux tiers relèvent des assurances
          respectives du Client et du Partenaire. OfficeFlex n&apos;est ni assureur, ni
          garant, ni séquestre de ces sommes.
        </p>
      </Section>

      <Section title="9. Assurances">
        <p>
          Le Partenaire et le Client déclarent être assurés au titre de leur
          responsabilité civile professionnelle pour les activités exercées à
          l&apos;occasion de la mise à disposition. Chacun s&apos;engage à en
          justifier sur simple demande d&apos;OfficeFlex.
        </p>
      </Section>

      <Section title="10. Lutte contre la fraude">
        <p>
          OfficeFlex peut suspendre une réservation, un reversement ou un compte en cas
          de suspicion sérieuse de fraude, d&apos;usurpation d&apos;identité ou
          d&apos;opération contraire aux obligations de lutte contre le blanchiment,
          le temps des vérifications nécessaires.
        </p>
      </Section>

      <Section title="11. Preuve">
        <p>
          Les registres informatisés d&apos;OfficeFlex, ses journaux d&apos;audit et
          les données de connexion sont conservés dans des conditions de nature à en
          garantir l&apos;intégrité et sont admis comme mode de preuve entre les
          parties, conformément à l&apos;article 1366 du Code civil.
        </p>
      </Section>

      <Section title="12. Droit applicable et juridiction">
        <p>
          Les présentes conditions sont soumises au droit français. Tout litige relève
          de la compétence exclusive des tribunaux du ressort de{" "}
          <ToFill>ville du siège</ToFill>.
        </p>
      </Section>
    </LegalPage>
  );
}
