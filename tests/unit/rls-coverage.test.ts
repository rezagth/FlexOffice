import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tripwire for S-02, running with no database.
 *
 * Supabase exposes `public` through PostgREST with the publishable key that
 * ships in the browser bundle. A table created without RLS is therefore
 * readable — and, with the default grants, writable — by anyone. Migration
 * 20260830140000 closed that for every table existing at the time; this
 * test fails when a later migration adds a table and forgets to.
 *
 * It reads the SQL, not the database, so it also protects deployments that
 * are not on Supabase (where nothing enables RLS on your behalf) — the
 * local development database had RLS off on all 14 tables while the hosted
 * one had it on, which is exactly the drift this catches.
 */
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../prisma/migrations");

function allMigrations() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"),
    }));
}

/** Tables created by CREATE TABLE across every migration. */
function createdTables(): Map<string, string> {
  const byTable = new Map<string, string>();
  for (const { name, sql } of allMigrations()) {
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sql))) {
      byTable.set(match[1], name);
    }
  }
  return byTable;
}

function tablesWithRlsEnabled(): Set<string> {
  const enabled = new Set<string>();
  for (const { sql } of allMigrations()) {
    const re = /ALTER\s+TABLE\s+"?([A-Za-z0-9_]+)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sql))) {
      enabled.add(match[1]);
    }
  }
  return enabled;
}

describe("row level security coverage (S-02)", () => {
  it("enables RLS on every table the migrations create", () => {
    const created = createdTables();
    const enabled = tablesWithRlsEnabled();

    const missing = [...created.entries()]
      .filter(([table]) => !enabled.has(table))
      .map(([table, migration]) => `${table} (created in ${migration})`);

    expect(
      missing,
      `These tables are reachable through PostgREST with the public key and ` +
        `have no ENABLE ROW LEVEL SECURITY in any migration:\n  ${missing.join("\n  ")}\n` +
        `Add the RLS + REVOKE block to the migration that creates them ` +
        `(see 20260830140000_enable_rls_revoke_public_grants).`
    ).toEqual([]);
  });

  it("revokes the PostgREST-reachable roles' privileges on the public schema", () => {
    const revokes = allMigrations().filter(({ sql }) =>
      /REVOKE\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM[^;]*anon/i.test(sql)
    );
    expect(
      revokes.length,
      "No migration revokes anon/authenticated privileges on the public schema."
    ).toBeGreaterThan(0);
  });
});
