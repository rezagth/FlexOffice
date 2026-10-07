/**
 * Promote (or demote) a platform administrator.
 *
 *   DATABASE_URL=... pnpm admin:promote someone@example.fr --confirm
 *   DATABASE_URL=... pnpm admin:promote someone@example.fr --demote --confirm
 *
 * Runs against whatever DATABASE_URL points at — check it twice. Without
 * --confirm it only prints what it would do. The operator name (for the
 * audit log) is taken from OPERATOR or the system user.
 * See docs/runbooks/promouvoir-admin.md.
 */
import "dotenv/config";
import { userInfo } from "node:os";
import { prisma } from "../src/server/db/prisma";
import { setPlatformAdmin } from "../src/server/domains/admin/promote-admin";

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith("--"));
  const demote = args.includes("--demote");
  const confirm = args.includes("--confirm");

  if (!email || !email.includes("@")) {
    console.error("Usage: pnpm admin:promote <email> [--demote] --confirm");
    process.exit(2);
  }
  const database = (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@");
  console.log(`${demote ? "Demote" : "Promote"} ${email} on ${database || "(DATABASE_URL not set)"}`);
  if (!confirm) {
    console.log("Dry run: add --confirm to apply.");
    return;
  }

  const result = await setPlatformAdmin({
    email,
    admin: !demote,
    operator: process.env.OPERATOR || userInfo().username,
  });
  console.log(result.changed ? `Done: role is now ${result.platformRole}.` : `Nothing to do: role already ${result.platformRole}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
