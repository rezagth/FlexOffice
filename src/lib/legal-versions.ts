/**
 * Versions of the legal documents a user accepts (B-11). Isomorphic: shown
 * next to the checkboxes and written to the database by the server.
 *
 * Bump the matching constant whenever the text of /cgu, /confidentialite or
 * /cgv changes in substance — the stored version is what proves which text
 * a given user agreed to. The value is the date the text took effect.
 */
export const TERMS_VERSION = "2026-10-07";

/** Version of the CGV (conditions générales de vente) accepted at booking. */
export const CGV_VERSION = "2026-10-10";

/**
 * Version of the CGV the landlord (the "Partenaire") accepts, which carry the
 * billing mandate (article 6). Same document as CGV_VERSION: one text, one
 * version, so that bumping it asks every landlord to accept again.
 */
export const PARTNER_TERMS_VERSION = CGV_VERSION;

/** Version of the domiciliation contract of the licensed domiciliataire,
 * accepted by a company that asks to be domiciled through MakomSpace. Bump it
 * when that contract changes in substance. */
export const DOMICILIATION_CONTRACT_VERSION = "2026-11-01";
