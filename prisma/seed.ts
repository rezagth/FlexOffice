import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/server/db/prisma";
import { createSupabaseAdminClient } from "../src/server/auth/supabase-admin";

/**
 * Demo seed. Creates privileged accounts with the Supabase service role, so
 * it is deliberately hard to point at anything but a local database.
 *
 * Security notes (S-05):
 *   * No credential is hard-coded. Passwords come from the environment or
 *     are generated per run and printed once.
 *   * The script refuses to run unless DATABASE_URL points at localhost.
 *     Seeding a shared database with known demo accounts is how a staging
 *     environment becomes an open door.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — refusing to seed.");
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string — refusing to seed.");
  }

  if (LOCAL_HOSTS.has(host)) return;

  // Escape hatch for the rare deliberate case (seeding a throwaway preview
  // database). It must name the exact host, so it cannot be switched on by a
  // stray SEED_ALLOW_NON_LOCAL_DB=1 in a CI environment.
  if (process.env.SEED_ALLOW_NON_LOCAL_DB === host) {
    console.warn(`! Seeding NON-LOCAL database at ${host} — explicitly allowed.\n`);
    return;
  }

  throw new Error(
    `DATABASE_URL points at "${host}", not a local database.\n` +
      `This script creates an ADMIN account with the service role key.\n` +
      `If you really mean it, re-run with SEED_ALLOW_NON_LOCAL_DB="${host}".`
  );
}

/** Password from the environment, or a fresh random one printed at the end. */
function passwordFor(envVar: string) {
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.length >= 12) return { value: fromEnv, generated: false };
  if (fromEnv) {
    throw new Error(`${envVar} is set but shorter than 12 characters — refusing to seed.`);
  }
  return { value: `${randomBytes(12).toString("base64url")}Aa1!`, generated: true };
}

const accounts = {
  admin: {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@officeflex.demo",
    password: passwordFor("SEED_ADMIN_PASSWORD"),
  },
  partnerParis: {
    email: process.env.SEED_PARTNER_PARIS_EMAIL ?? "paris@officeflex.demo",
    password: passwordFor("SEED_PARTNER_PARIS_PASSWORD"),
  },
  partnerLyon: {
    email: process.env.SEED_PARTNER_LYON_EMAIL ?? "lyon@officeflex.demo",
    password: passwordFor("SEED_PARTNER_LYON_PASSWORD"),
  },
  client: {
    email: process.env.SEED_CLIENT_EMAIL ?? "client@officeflex.demo",
    password: passwordFor("SEED_CLIENT_PASSWORD"),
  },
};

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function ensureUser(
  admin: Admin,
  email: string,
  password: string,
  metadata: Record<string, string>
): Promise<string> {
  const { data: page, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw listError;

  const existing = page.users.find((u) => u.email === email);
  if (existing) {
    console.log(`  (already exists) ${email}`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) {
    throw error ?? new Error(`Failed to create ${email}`);
  }
  console.log(`  created ${email}`);
  return data.user.id;
}

async function main() {
  assertLocalDatabase();

  const admin = createSupabaseAdminClient();

  console.log("Seeding demo accounts…");

  // The signup trigger whitelists the role to CLIENT | PARTNER (migration
  // 20260830120000_harden_signup_role_whitelist, fix for S-01), so passing
  // role: "ADMIN" in user_metadata no longer does anything. Promotion is an
  // explicit privileged write, which is exactly the point.
  const adminUserId = await ensureUser(admin, accounts.admin.email, accounts.admin.password.value, {
    name: "Admin OfficeFlex",
  });
  await prisma.profile.update({ where: { id: adminUserId }, data: { role: "ADMIN" } });
  console.log("  promoted to ADMIN");

  const parisUserId = await ensureUser(
    admin,
    accounts.partnerParis.email,
    accounts.partnerParis.password.value,
    {
      role: "PARTNER",
      name: "Julie Martin",
      organization_name: "Atelier Partners",
      organization_siret: "12345678900014",
      organization_address: "12 rue de Rivoli",
      organization_city: "Paris",
      organization_postal_code: "75004",
    }
  );

  const lyonUserId = await ensureUser(
    admin,
    accounts.partnerLyon.email,
    accounts.partnerLyon.password.value,
    {
      role: "PARTNER",
      name: "Marc Dubois",
      organization_name: "Confluence Bureaux",
      organization_siret: "98765432100013",
      organization_address: "5 quai Perrache",
      organization_city: "Lyon",
      organization_postal_code: "69002",
    }
  );

  await ensureUser(admin, accounts.client.email, accounts.client.password.value, {
    role: "CLIENT",
    name: "Sam Client",
  });

  const [parisProfile, lyonProfile] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { id: parisUserId } }),
    prisma.profile.findUniqueOrThrow({ where: { id: lyonUserId } }),
  ]);

  await prisma.organization.updateMany({
    where: { id: { in: [parisProfile.organizationId!, lyonProfile.organizationId!] } },
    data: { status: "VERIFIED" },
  });

  const spaceCount = await prisma.space.count();
  if (spaceCount === 0) {
    console.log("Seeding demo spaces…");
    await prisma.space.createMany({
      data: [
        {
          organizationId: parisProfile.organizationId!,
          slug: "salle-rivoli-paris",
          name: "Salle Rivoli",
          type: "MEETING_ROOM",
          description:
            "Salle de réunion lumineuse en plein cœur de Paris, écran et visioconférence inclus.",
          address: "12 rue de Rivoli",
          city: "Paris",
          postalCode: "75004",
          capacity: 8,
          amenities: ["Wifi", "Écran", "Caméra", "Tableau blanc"],
          photos: [],
          halfDayPriceCents: 12000,
          dayPriceCents: 20000,
          status: "PUBLISHED",
        },
        {
          organizationId: parisProfile.organizationId!,
          slug: "bureau-flex-paris",
          name: "Bureau individuel Flex",
          type: "DESK",
          description: "Bureau calme pour un rendez-vous client ou une journée concentrée.",
          address: "12 rue de Rivoli",
          city: "Paris",
          postalCode: "75004",
          capacity: 2,
          amenities: ["Wifi", "Imprimante"],
          photos: [],
          halfDayPriceCents: 4000,
          dayPriceCents: 7000,
          status: "PUBLISHED",
        },
        {
          organizationId: lyonProfile.organizationId!,
          slug: "espace-formation-confluence",
          name: "Espace formation Confluence",
          type: "TRAINING_ROOM",
          description: "Grand espace modulable pour formations et ateliers jusqu'à 20 personnes.",
          address: "5 quai Perrache",
          city: "Lyon",
          postalCode: "69002",
          capacity: 20,
          amenities: ["Wifi", "Vidéoprojecteur", "Paperboard", "Parking"],
          photos: [],
          halfDayPriceCents: 18000,
          dayPriceCents: 30000,
          status: "PUBLISHED",
        },
      ],
    });
  } else {
    console.log("  (spaces already seeded)");
  }

  const generated = Object.entries(accounts).filter(([, a]) => a.password.generated);
  console.log("\nDemo accounts:");
  for (const [key, account] of Object.entries(accounts)) {
    const suffix = account.password.generated ? account.password.value : "(from environment)";
    console.log(`  ${key.padEnd(14)} ${account.email.padEnd(28)} ${suffix}`);
  }
  if (generated.length > 0) {
    console.log(
      "\nGenerated passwords are printed once and not stored. Re-running the seed\n" +
        "will NOT reset them for accounts that already exist — set SEED_*_PASSWORD\n" +
        "in your .env if you want stable local credentials."
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
