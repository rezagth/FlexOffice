import { LegalPage, Section, ToFill } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Gestion des cookies — OfficeFlex",
  description: "Cookies déposés par OfficeFlex et raisons de leur dépôt.",
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Gestion des cookies"
      intro="Cette page décrit les traceurs déposés par la plateforme. Elle est volontairement courte : il y en a peu."
    >
      <Section title="1. Ce que dépose OfficeFlex aujourd'hui">
        <p>
          La plateforme ne dépose que les cookies <strong>strictement nécessaires</strong>{" "}
          à son fonctionnement. Aucun cookie publicitaire, aucun traceur de mesure
          d&apos;audience, aucun partage avec un réseau social n&apos;est mis en œuvre.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-border py-2 pr-4 text-left font-medium">
                  Cookie
                </th>
                <th className="border-b border-border py-2 pr-4 text-left font-medium">
                  Rôle
                </th>
                <th className="border-b border-border py-2 text-left font-medium">
                  Durée
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b border-border py-2 pr-4">
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    sb-…-auth-token
                  </code>
                </td>
                <td className="border-b border-border py-2 pr-4">
                  Maintient votre session ouverte entre deux pages. Sans lui, vous
                  seriez déconnecté à chaque navigation.
                </td>
                <td className="border-b border-border py-2">
                  Durée de la session, renouvelée tant que vous restez connecté
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="2. Pourquoi aucun bandeau de consentement">
        <p>
          L&apos;article 82 de la loi Informatique et Libertés, qui transpose la
          directive 2002/58/CE, exempte de consentement préalable les traceurs ayant
          pour finalité exclusive de permettre ou faciliter la communication par voie
          électronique, ou strictement nécessaires à la fourniture d&apos;un service
          expressément demandé par l&apos;utilisateur. Le cookie
          d&apos;authentification relève de cette exemption.
        </p>
        <p>
          Un bandeau de consentement deviendra obligatoire dès qu&apos;un outil de
          mesure d&apos;audience non exempté, une régie publicitaire ou un traceur
          tiers sera introduit. Cette page sera alors mise à jour avant toute
          activation.
        </p>
      </Section>

      <Section title="3. Refuser ou supprimer les cookies">
        <p>
          Vous pouvez supprimer ou bloquer les cookies depuis les réglages de votre
          navigateur. Le blocage du cookie d&apos;authentification empêche toutefois de
          se connecter : les espaces client, partenaire et administrateur deviennent
          inaccessibles. Les pages publiques, elles, restent consultables.
        </p>
      </Section>

      <Section title="4. Questions">
        <p>
          Pour toute question relative aux traceurs, écrivez à{" "}
          <ToFill>adresse e-mail dédiée</ToFill>. Le traitement des données
          personnelles est détaillé dans la politique de confidentialité.
        </p>
      </Section>
    </LegalPage>
  );
}
