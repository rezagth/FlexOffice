import Link from "next/link";
import { LegalPage, Section, ToFill } from "@/components/marketing/legal-page";
import { ManageCookiesButton } from "@/components/marketing/manage-cookies-button";

export const metadata = {
  title: "Gestion des cookies — OfficeFlex",
  description: "Cookies et traceurs utilisés par OfficeFlex, et comment gérer votre consentement.",
};

const cell = "border-b border-border py-2 pr-4 align-top";

export default function CookiesPage() {
  return (
    <LegalPage
      title="Gestion des cookies"
      intro="Cette page décrit les traceurs utilisés par la plateforme, ceux qui exigent votre accord et la façon de modifier votre choix à tout moment."
    >
      <Section title="1. Traceurs utilisés">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-border py-2 pr-4 text-left font-medium">Traceur</th>
                <th className="border-b border-border py-2 pr-4 text-left font-medium">Finalité</th>
                <th className="border-b border-border py-2 pr-4 text-left font-medium">Consentement</th>
                <th className="border-b border-border py-2 text-left font-medium">Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={cell}>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">sb-…-auth-token</code>
                </td>
                <td className={cell}>
                  Cookie de session : maintient votre connexion entre deux pages. Sans lui, vous
                  seriez déconnecté à chaque navigation.
                </td>
                <td className={cell}>Non requis (strictement nécessaire)</td>
                <td className="border-b border-border py-2 align-top">
                  Durée de la session, renouvelée tant que vous restez connecté
                </td>
              </tr>
              <tr>
                <td className={cell}>Mémorisation de votre choix</td>
                <td className={cell}>
                  Conserve votre acceptation ou votre refus des traceurs ci-dessous, pour ne pas
                  vous redemander à chaque page.
                </td>
                <td className={cell}>Non requis (strictement nécessaire)</td>
                <td className="border-b border-border py-2 align-top">6 mois, puis votre choix vous est redemandé</td>
              </tr>
              <tr>
                <td className={cell}>PostHog (analyse produit)</td>
                <td className={cell}>
                  Comprendre comment les fonctionnalités sont utilisées afin de les améliorer.
                  Données hébergées dans l&apos;Union européenne.
                </td>
                <td className={cell}>
                  <strong>Requis</strong> : déposé uniquement après votre accord
                </td>
                <td className="border-b border-border py-2 align-top">13 mois au plus</td>
              </tr>
              <tr>
                <td className={cell}>Umami (mesure d&apos;audience)</td>
                <td className={cell}>
                  Statistiques de fréquentation agrégées (pages vues, provenance), sur un outil
                  hébergé par l&apos;éditeur. <strong>Aucun cookie</strong> n&apos;est déposé et
                  aucun identifiant n&apos;est conservé sur votre terminal.
                </td>
                <td className={cell}>Non requis (aucun traceur sur votre terminal)</td>
                <td className="border-b border-border py-2 align-top">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Aucun cookie publicitaire et aucun traceur de réseau social ne sont utilisés.
        </p>
      </Section>

      <Section title="2. Votre consentement">
        <p>
          L&apos;article 82 de la loi Informatique et Libertés, qui transpose la directive
          2002/58/CE, exempte de consentement les traceurs strictement nécessaires au service
          que vous demandez, comme le cookie de session. Les autres, ici PostHog, ne sont
          déposés qu&apos;après votre accord exprès, recueilli par un bandeau qui permet de
          refuser aussi simplement que d&apos;accepter. Refuser n&apos;empêche pas
          d&apos;utiliser la plateforme.
        </p>
        <p>
          Vous pouvez retirer ou modifier votre consentement à tout moment, aussi simplement
          que vous l&apos;avez donné :
        </p>
        <ManageCookiesButton />
      </Section>

      <Section title="3. Supprimer les cookies depuis votre navigateur">
        <p>
          Vous pouvez aussi supprimer ou bloquer les cookies depuis les réglages de votre
          navigateur. Le blocage du cookie de session empêche toutefois de se connecter : les
          espaces client, partenaire et administrateur deviennent inaccessibles. Les pages
          publiques restent consultables.
        </p>
      </Section>

      <Section title="4. Questions">
        <p>
          Pour toute question relative aux traceurs, écrivez à{" "}
          <ToFill>adresse e-mail dédiée</ToFill>. Le traitement des données personnelles est
          détaillé dans la{" "}
          <Link href="/confidentialite" className="underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
