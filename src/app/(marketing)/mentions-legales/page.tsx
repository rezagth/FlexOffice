import { LegalPage, Section, ToFill } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Mentions légales — OfficeFlex",
  description: "Éditeur, hébergeur et contacts du site OfficeFlex.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      intro="Informations rendues obligatoires par la loi pour la confiance dans l'économie numérique (LCEN, article 6-III)."
    >
      <Section title="1. Éditeur du site">
        <p>
          Le site OfficeFlex, accessible à l&apos;adresse <ToFill>adresse du site</ToFill>,
          est édité par :
        </p>
        <ul className="list-disc pl-5">
          <li>
            Dénomination sociale : <ToFill>raison sociale</ToFill>
          </li>
          <li>
            Forme juridique : <ToFill>SAS, SARL…</ToFill>
          </li>
          <li>
            Capital social : <ToFill>montant</ToFill>
          </li>
          <li>
            Siège social : <ToFill>adresse complète</ToFill>
          </li>
          <li>
            Immatriculation : RCS de <ToFill>ville</ToFill> sous le numéro{" "}
            <ToFill>numéro RCS</ToFill>
          </li>
          <li>
            Numéro de TVA intracommunautaire : <ToFill>numéro de TVA</ToFill>
          </li>
          <li>
            Adresse électronique : <ToFill>contact@…</ToFill>
          </li>
          <li>
            Téléphone : <ToFill>numéro</ToFill>
          </li>
        </ul>
      </Section>

      <Section title="2. Direction de la publication">
        <p>
          Directeur de la publication : <ToFill>nom du représentant légal</ToFill>, en
          qualité de <ToFill>fonction</ToFill>.
        </p>
      </Section>

      <Section title="3. Hébergement">
        <p>
          Le site est hébergé par <ToFill>hébergeur, ex. Vercel Inc.</ToFill>,{" "}
          <ToFill>adresse de l&apos;hébergeur</ToFill>.
        </p>
        <p>
          Les données de la plateforme sont hébergées au sein de l&apos;Union
          européenne par <ToFill>fournisseur de base de données</ToFill>, région{" "}
          <ToFill>région d&apos;hébergement</ToFill>.
        </p>
      </Section>

      <Section title="4. Point de contact unique">
        <p>
          Conformément au règlement (UE) 2022/2065 sur les services numériques, le
          point de contact unique pour les autorités, les utilisateurs et les
          signalements est : <ToFill>adresse e-mail dédiée</ToFill>. Les échanges
          peuvent avoir lieu en français ou en anglais.
        </p>
      </Section>

      <Section title="5. Propriété intellectuelle">
        <p>
          La marque OfficeFlex, le nom de domaine, la charte graphique, les textes,
          la structure du site et les développements logiciels sont la propriété
          exclusive de l&apos;éditeur ou font l&apos;objet d&apos;une licence à son
          profit. Toute reproduction, représentation, adaptation ou extraction, totale
          ou partielle, par quelque procédé que ce soit, sans autorisation écrite
          préalable, est interdite et constitue une contrefaçon au sens des articles
          L.335-2 et suivants du Code de la propriété intellectuelle.
        </p>
        <p>
          Les photographies, descriptions et éléments publiés par les entreprises
          partenaires restent la propriété de leurs auteurs, qui concèdent à
          l&apos;éditeur une licence d&apos;utilisation dans les conditions prévues aux
          conditions générales d&apos;utilisation.
        </p>
      </Section>

      <Section title="6. Signalement de contenu illicite">
        <p>
          Tout contenu manifestement illicite peut être signalé à{" "}
          <ToFill>adresse e-mail de signalement</ToFill>. Le signalement doit préciser
          l&apos;adresse du contenu concerné, les motifs pour lesquels il est estimé
          illicite et les coordonnées de la personne à l&apos;origine du signalement.
          Chaque signalement fait l&apos;objet d&apos;un accusé de réception et
          d&apos;une décision motivée, conformément aux articles 16 et 17 du règlement
          sur les services numériques.
        </p>
      </Section>
    </LegalPage>
  );
}
