#!/usr/bin/env node
// Production dependency audit with an explicit, reviewable allowlist.
//
// Runs `pnpm audit --prod --json` and fails on any HIGH or CRITICAL advisory,
// except those listed in .github/audit-allowlist.json. An allowlist entry is
// only honoured when:
//   * its GHSA id matches;
//   * EVERY path through which the vulnerable package is reached starts with
//     one of the entry's `viaPrefixes` (so the same package arriving through
//     a runtime dependency later is NOT silently covered);
//   * its `expires` date (YYYY-MM-DD) has not passed — an exception is
//     re-examined, not forgotten.
//
// Why an allowlist exists at all: `@prisma/client` declares the Prisma CLI
// (`prisma`) as a dependency, so `pnpm audit --prod` walks the whole CLI tree
// (Studio, the local dev server, mysql2…). None of it ships in the runtime
// image: the standalone output only contains files Next.js traced from the
// application's imports. The CLI runs in CI and on the migration runner.
//
// Usage: node scripts/audit-prod.mjs [--audit-json <file>]
//   --audit-json lets the tests (and a curious human) feed a saved report.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BLOCKING = new Set(["high", "critical"]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function evaluateAudit(report, allowlist, today = new Date().toISOString().slice(0, 10)) {
  const blocking = [];
  const allowed = [];
  const expired = [];

  for (const advisory of Object.values(report.advisories ?? {})) {
    if (!BLOCKING.has(advisory.severity)) continue;
    const id = advisory.github_advisory_id;
    const paths = (advisory.findings ?? []).flatMap((finding) => finding.paths ?? []);
    const entry = allowlist.find((candidate) => candidate.id === id);

    const coveredByPrefix =
      entry !== undefined &&
      paths.length > 0 &&
      paths.every((p) => entry.viaPrefixes.some((prefix) => p.startsWith(prefix)));

    const summary = { id, module: advisory.module_name, severity: advisory.severity, paths };
    if (!coveredByPrefix) {
      blocking.push(summary);
    } else if (entry.expires < today) {
      expired.push({ ...summary, expires: entry.expires });
    } else {
      allowed.push({ ...summary, reason: entry.reason });
    }
  }

  return { blocking, allowed, expired, ok: blocking.length === 0 && expired.length === 0 };
}

function main() {
  const args = process.argv.slice(2);
  const jsonIndex = args.indexOf("--audit-json");
  let raw;
  if (jsonIndex !== -1) {
    raw = readFileSync(args[jsonIndex + 1], "utf8");
  } else {
    try {
      raw = execFileSync("pnpm", ["audit", "--prod", "--json"], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (error) {
      // pnpm audit exits non-zero when it finds anything; the JSON is still on stdout.
      raw = error.stdout;
      if (!raw) throw error;
    }
  }

  const report = JSON.parse(raw);
  const allowlist = JSON.parse(readFileSync(path.join(root, ".github/audit-allowlist.json"), "utf8")).entries;
  const result = evaluateAudit(report, allowlist);

  for (const item of result.allowed) {
    console.log(`allowed  ${item.severity.padEnd(8)} ${item.id} ${item.module} — ${item.reason}`);
  }
  for (const item of result.expired) {
    console.log(`EXPIRED  ${item.severity.padEnd(8)} ${item.id} ${item.module} (exception expired ${item.expires})`);
  }
  for (const item of result.blocking) {
    console.log(`BLOCKING ${item.severity.padEnd(8)} ${item.id} ${item.module}\n         via ${item.paths.join("\n         via ")}`);
  }

  if (!result.ok) {
    console.error("\nProduction dependency audit failed. Upgrade, override in pnpm-workspace.yaml, or — only for a package that never reaches the runtime image — add a dated entry to .github/audit-allowlist.json.");
    process.exit(1);
  }
  console.log(`\nNo blocking advisory (${result.allowed.length} allowlisted).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
