/**
 * Shared shape of every transactional e-mail: one structured body rendered
 * twice — as plain text (kept: some clients and every spam filter read it)
 * and as table-based HTML that survives Outlook, Gmail and Apple Mail.
 *
 * Templates never write HTML themselves. They describe paragraphs, detail
 * rows and one call-to-action; this module is the only place markup is
 * produced, and every piece of data is escaped here. A space name, a
 * description or a client's name is user-supplied text and must never be
 * able to inject markup or links into a message sent under our name.
 */

import { SITE_NAME } from "@/lib/site";

export const BRAND_NAME = SITE_NAME;
const NAVY = "#041627";
const GOLD = "#C5A059";
const PAGE_BACKGROUND = "#F4F1EA";
const TEXT_COLOR = "#1F2933";
const MUTED_COLOR = "#5F6B76";

export type EmailDetailRow = { label: string; value: string };

export type EmailBody = {
  /** First line, e.g. "Bonjour Jeanne,". */
  greeting?: string;
  /** Plain-text paragraphs, in order. Escaped in the HTML version. */
  paragraphs: string[];
  /** Optional key/value block (dates, address, amount…). */
  details?: EmailDetailRow[];
  /** Paragraphs shown after the details block. */
  closing?: string[];
  /** A single button. `path` is relative to APP_URL ("/app/bookings"). */
  action?: { label: string; path: string };
};

export type RenderedEmail = { to: string; subject: string; text: string; html: string };

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for an HTML element body or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Origin every link in an e-mail points to. APP_URL in any real deployment
 * (behind a proxy the request host is internal); the local dev server
 * otherwise, so a development e-mail still has a working link.
 */
export function appBaseUrl(): string {
  const configured = process.env.APP_URL || undefined;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}

/** Absolute URL for an in-app path. Only paths starting with a single "/"
 * are accepted, so a template can never be turned into an open redirect. */
export function appUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`Email links must be app-relative paths, got "${path}"`);
  }
  return `${appBaseUrl()}${path}`;
}

const LEGAL_NOTICE =
  `${BRAND_NAME} — plateforme de réservation d'espaces professionnels. ` +
  "Cet e-mail transactionnel vous est envoyé car vous utilisez nos services.";

function renderText(body: EmailBody): string {
  const lines: string[] = [];
  if (body.greeting) lines.push(body.greeting, "");
  for (const paragraph of body.paragraphs) lines.push(paragraph, "");
  if (body.details && body.details.length > 0) {
    for (const row of body.details) lines.push(`${row.label} : ${row.value}`);
    lines.push("");
  }
  for (const paragraph of body.closing ?? []) lines.push(paragraph, "");
  if (body.action) lines.push(`${body.action.label} : ${appUrl(body.action.path)}`, "");
  lines.push("—", LEGAL_NOTICE, `Une question ? ${appUrl("/contact")}`);
  return lines.join("\n");
}

/** Line breaks inside a value (access instructions) are kept visible. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:${TEXT_COLOR};">${escapeMultiline(text)}</p>`;
}

function renderHtml(subject: string, body: EmailBody): string {
  const parts: string[] = [];
  if (body.greeting) parts.push(paragraphHtml(body.greeting));
  for (const paragraph of body.paragraphs) parts.push(paragraphHtml(paragraph));

  if (body.details && body.details.length > 0) {
    const rows = body.details
      .map(
        (row) =>
          `<tr><td style="padding:6px 12px 6px 0;font-size:14px;line-height:20px;color:${MUTED_COLOR};vertical-align:top;white-space:nowrap;">${escapeHtml(row.label)}</td>` +
          `<td style="padding:6px 0;font-size:14px;line-height:20px;color:${TEXT_COLOR};vertical-align:top;">${escapeMultiline(row.value)}</td></tr>`
      )
      .join("");
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px 0;border-top:1px solid #E5E0D5;border-bottom:1px solid #E5E0D5;"><tr><td style="padding:10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`
    );
  }

  for (const paragraph of body.closing ?? []) parts.push(paragraphHtml(paragraph));

  if (body.action) {
    const href = escapeHtml(appUrl(body.action.path));
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;"><tr>` +
        `<td align="center" bgcolor="${NAVY}" style="border-radius:6px;">` +
        `<a href="${href}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;border:1px solid ${NAVY};">${escapeHtml(body.action.label)}</a>` +
        `</td></tr></table>`
    );
  }

  const contactHref = escapeHtml(appUrl("/contact"));
  return [
    "<!DOCTYPE html>",
    '<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:${PAGE_BACKGROUND};font-family:Arial,Helvetica,sans-serif;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE_BACKGROUND}"><tr><td align="center" style="padding:24px 12px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:8px;">`,
    `<tr><td bgcolor="${NAVY}" style="padding:20px 32px;border-radius:8px 8px 0 0;border-bottom:3px solid ${GOLD};">`,
    `<span style="font-size:22px;font-weight:bold;letter-spacing:0.5px;color:#FFFFFF;">Office</span><span style="font-size:22px;font-weight:bold;letter-spacing:0.5px;color:${GOLD};">Flex</span>`,
    "</td></tr>",
    `<tr><td style="padding:32px;">${parts.join("")}</td></tr>`,
    `<tr><td style="padding:20px 32px;border-top:1px solid #E5E0D5;font-size:12px;line-height:18px;color:${MUTED_COLOR};">`,
    `${escapeHtml(LEGAL_NOTICE)}<br>Une question ? <a href="${contactHref}" style="color:${NAVY};text-decoration:underline;">Contactez-nous</a>`,
    "</td></tr></table>",
    "</td></tr></table></body></html>",
  ].join("");
}

/** Builds the message: same content as text and as HTML. */
export function renderEmail(to: string, rawSubject: string, body: EmailBody): RenderedEmail {
  // A subject carries user data (a space name): no line break may reach the
  // header, whatever the provider does with it.
  const subject = rawSubject.replace(/[\r\n]+/g, " ").trim();
  return { to, subject, text: renderText(body), html: renderHtml(subject, body) };
}
