import Link from "next/link";
import { LegalPage, Section, ToFill } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Mentions légales — MakomSpace",
  description: "Éditeur, hébergement et contacts du site MakomSpace.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      intro="Informations rendues obligatoires par la loi pour la confiance dans l'économie numérique (LCEN, article 6-III) et par le Code de commerce."
    >
      <Section title="1. Éditeur du site">
        <p>Le site et la plateforme MakomSpace sont édités par :</p>
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
            Siège social : <ToFill>adresse complète du siège</ToFill>
          </li>
          <li>
            Immatriculation : RCS de <ToFill>ville du greffe</ToFill> sous le numéro{" "}
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
          Directeur de la publication : <ToFill>nom et fonction du représentant légal</ToFill>.
        </p>
      </Section>

      <Section title="3. Hébergement">
        <p>
          Le site et l&apos;ensemble des données de la plateforme (comptes, réservations,
          fichiers, journaux) sont hébergés en France, sur un serveur dédié exploité par
          l&apos;éditeur lui-même, <ToFill>raison sociale</ToFill>, dont les coordonnées
          figurent à l&apos;article 1. Les logiciels de base de données,
          d&apos;authentification, de stockage de fichiers, de mesure d&apos;audience et de
          suivi des erreurs sont installés et exploités par l&apos;éditeur sur ce serveur :
          aucun prestataire d&apos;hébergement tiers n&apos;y a accès.
        </p>
        <p>
          Le trafic entre les visiteurs et le serveur transite par le réseau de diffusion
          de contenu et de protection de <strong>Cloudflare, Inc.</strong>, 101 Townsend
          Street, San Francisco, CA 94107, États-Unis (téléphone : +1 888 993 5273), qui
          assure la mise en cache des contenus publics, la protection contre les attaques
          et l&apos;acheminement chiffré des requêtes vers le serveur.
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
          La marque MakomSpace, le nom de domaine, la charte graphique, les textes,
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

      <Section title="7. Données personnelles et cookies">
        <p>
          Le traitement des données personnelles est décrit dans la{" "}
          <Link href="/confidentialite" className="underline">
            politique de confidentialité
          </Link>
          , et les traceurs déposés sur la page{" "}
          <Link href="/cookies" className="underline">
            gestion des cookies
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
