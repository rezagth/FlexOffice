/**
 * `pnpm check:legal` — lists the company facts the legal pages still lack
 * (mentions légales, CGU, CGV, confidentialité, cookies). Exit code 1 while
 * any is missing, 0 once complete: usable as a gate before the first real
 * customer (for instance as part of the production build command).
 * Prints variable names only, never values.
 */
import { missingLegalFields } from "../src/lib/legal-identity";

const missing = missingLegalFields();
if (missing.length === 0) {
  console.log("Textes légaux : toutes les informations de la société sont renseignées.");
  process.exit(0);
}
console.error(`Textes légaux incomplets : ${missing.length} variable(s) à renseigner.`);
for (const name of missing) console.error(`  - ${name}`);
process.exit(1);
