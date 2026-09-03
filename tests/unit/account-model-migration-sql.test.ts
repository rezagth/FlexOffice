import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tripwire for the Phase 2 account model, running with no database.
 *
 * The behaviour is proven by tests/integration/account-model.test.ts and by
 * running the migration against a populated pre-Phase-2 copy. Neither runs
 * without a database, so this reads the SQL and fails if the pieces that
 * cannot be re-derived later go missing.
 *
 * What it protects, and why each one matters:
 *   * the backfill — it runs exactly once, on the deploy that applies the
 *     migration. Delete it after that and nothing fails: existing accounts
 *     simply lose their landlord access, silently, with no error anywhere.
 *   * the capability CHECK — the one thing making LANDLORD-without-capability
 *     unrepresentable even for a direct SQL write.
 *   * the RLS block on the new table — tests/unit/rls-coverage.test.ts
 *     already checks it, duplicated here with the reason attached.
 *   * `platform_role` hard-coded in the trigger — the moment it is derived
 *     from `raw_user_meta_data` instead, signup becomes a path to ADMIN.
 *
 * It checks the shape of the SQL, not its behaviour. It is not a substitute
 * for the integration suite.
 */
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../prisma/migrations");

function migrationSql(prefix: string): string {
  const dir = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
    .map((e) => e.name)
    .sort()
    .at(-1);
  if (!dir) throw new Error(`No migration starting with ${prefix}`);
  return readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
}

describe("account model expand migration", () => {
  const sql = migrationSql("20260904100000_account_model_expand");

  it("creates organization_members with RLS enabled", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+"organization_members"/i);
    expect(
      /ALTER\s+TABLE\s+"organization_members"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql),
      "organization_members is reachable through PostgREST with the publishable " +
        "key unless RLS is enabled in the migration that creates it."
    ).toBe(true);
  });

  it("revokes the PostgREST-reachable roles on the new table", () => {
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE\s+public\.organization_members/i);
  });

  it("makes a duplicate membership impossible via the composite primary key", () => {
    expect(sql).toMatch(
      /organization_members_pkey"\s+PRIMARY\s+KEY\s+\("organization_id",\s*"profile_id"\)/i
    );
  });

  it("keeps LANDLORD mode unrepresentable without the capability", () => {
    expect(
      /profiles_landlord_mode_requires_capability_check[\s\S]*?CHECK[\s\S]*?"active_mode"\s*<>\s*'LANDLORD'\s*OR\s*"is_landlord"\s*=\s*true/i.test(
        sql
      ),
      "Without this CHECK, a direct SQL write can put an account into " +
        "landlord mode with no landlord capability."
    ).toBe(true);
  });

  it("ties the SIRET requirement to the holder type", () => {
    expect(sql).toMatch(/organizations_holder_type_siret_check/i);
    // Individuals must be able to exist without one.
    expect(sql).toMatch(/ALTER\s+COLUMN\s+"siret"\s+DROP\s+NOT\s+NULL/i);
  });

  describe("backfill — runs once, and cannot be re-derived if removed", () => {
    it("converts the old ADMIN role to the platform role", () => {
      expect(sql).toMatch(
        /UPDATE\s+"profiles"\s+SET\s+"platform_role"\s*=\s*'ADMIN'\s+WHERE\s+"role"\s*=\s*'ADMIN'/i
      );
    });

    it("unlocks the landlord capability for an old PARTNER with an organization", () => {
      expect(
        /UPDATE\s+"profiles"[\s\S]*?"is_landlord"\s*=\s*true[\s\S]*?"role"\s*=\s*'PARTNER'/i.test(sql),
        "An existing partner would silently lose landlord access."
      ).toBe(true);
    });

    it("turns the old organizationId column into an OWNER membership", () => {
      expect(
        /INSERT\s+INTO\s+"organization_members"[\s\S]*?'OWNER'[\s\S]*?FROM\s+"profiles"[\s\S]*?"organization_id"\s+IS\s+NOT\s+NULL/i.test(
          sql
        ),
        "Every landlord authorization reads organization_members. Without " +
          "this insert, existing organizations would have no members and " +
          "grant nothing."
      ).toBe(true);
    });

    it("preselects the organization the account already had", () => {
      expect(sql).toMatch(/SET\s+"active_organization_id"\s*=\s*"organization_id"/i);
    });
  });
});

describe("signup trigger after the account model change", () => {
  const sql = migrationSql("20260904100100_signup_creates_account_model");

  it("still whitelists the client-supplied role (S-01)", () => {
    // raw_user_meta_data is the options.data payload of signUp() and is
    // reachable without this app at all.
    const whitelists =
      /v_role\s+NOT\s+IN\s*\(\s*'CLIENT'\s*,\s*'PARTNER'\s*\)/i.test(sql) ||
      /v_role\s+IN\s*\(\s*'CLIENT'\s*,\s*'PARTNER'\s*\)/i.test(sql);
    expect(
      whitelists,
      "Reopens S-01: anyone could sign up as ADMIN via /auth/v1/signup."
    ).toBe(true);
  });

  it("hard-codes platform_role rather than deriving it from the payload", () => {
    expect(sql).toMatch(/'USER'/);
    expect(
      /platform_role[\s\S]{0,200}raw_user_meta_data/i.test(sql),
      "platform_role must never be read from client-supplied metadata — " +
        "that would make signup a path to ADMIN."
    ).toBe(false);
  });

  it("creates the OWNER membership for a partner signup", () => {
    expect(
      /INSERT\s+INTO\s+public\.organization_members[\s\S]*?'OWNER'/i.test(sql),
      "A partner signup would otherwise create an organization with no " +
        "members, which looks correct and grants nothing."
    ).toBe(true);
  });

  it("starts every account in TENANT mode", () => {
    expect(sql).toMatch(/'TENANT'/);
  });
});
