import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tripwire for S-01, running with no database.
 *
 * The real proof lives in tests/integration/signup-role-escalation.test.ts,
 * which performs an actual hostile signup — but that suite is skipped until a
 * Supabase project exists, so right now nothing would notice the whitelist
 * disappearing. This test reads the migration SQL itself and fails if the
 * effective definition of handle_new_user stops constraining the role.
 *
 * It checks the shape of the SQL, not its behaviour. Do not let it stand in
 * for the integration test once a backend is configured.
 */
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../prisma/migrations");

function migrationsDefiningHandleNewUser() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"),
    }))
    .filter(({ sql }) => /FUNCTION\s+public\.handle_new_user/i.test(sql));
}

describe("handle_new_user signup trigger (S-01)", () => {
  it("is defined by at least one migration", () => {
    expect(migrationsDefiningHandleNewUser().length).toBeGreaterThan(0);
  });

  it("constrains the role to CLIENT or PARTNER in its latest definition", () => {
    const definitions = migrationsDefiningHandleNewUser();
    const latest = definitions[definitions.length - 1];

    // Whitelist, in any reasonable spelling: the role variable is compared
    // against the two allowed values before it reaches the INSERT.
    const whitelists =
      /v_role\s+NOT\s+IN\s*\(\s*'CLIENT'\s*,\s*'PARTNER'\s*\)/i.test(latest.sql) ||
      /v_role\s+IN\s*\(\s*'CLIENT'\s*,\s*'PARTNER'\s*\)/i.test(latest.sql);

    expect(
      whitelists,
      `${latest.name} redefines handle_new_user without whitelisting the role. ` +
        `raw_user_meta_data is client-controlled: this reopens S-01 ` +
        `(anyone can sign up as ADMIN via /auth/v1/signup).`
    ).toBe(true);
  });
});
