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
export const CGV_VERSION = "2026-10-06";
