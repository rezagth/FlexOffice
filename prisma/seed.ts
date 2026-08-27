import "dotenv/config";
import { prisma } from "../src/server/db/prisma";
import { createSupabaseAdminClient } from "../src/server/auth/supabase-admin";

const ADMIN = { email: "admin@officeflex.demo", password: "OfficeFlexAdmin123!" };
const PARTNER_PARIS = { email: "paris@officeflex.demo", password: "OfficeFlexDemo123!" };
const PARTNER_LYON = { email: "lyon@officeflex.demo", password: "OfficeFlexDemo123!" };
const CLIENT = { email: "client@officeflex.demo", password: "OfficeFlexDemo123!" };

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
  const admin = createSupabaseAdminClient();

  console.log("Seeding demo accounts…");
  await ensureUser(admin, ADMIN.email, ADMIN.password, {
    role: "ADMIN",
    name: "Admin OfficeFlex",
  });

  const parisUserId = await ensureUser(admin, PARTNER_PARIS.email, PARTNER_PARIS.password, {
    role: "PARTNER",
    name: "Julie Martin",
    organization_name: "Atelier Partners",
    organization_siret: "12345678900014",
    organization_address: "12 rue de Rivoli",
    organization_city: "Paris",
    organization_postal_code: "75004",
  });

  const lyonUserId = await ensureUser(admin, PARTNER_LYON.email, PARTNER_LYON.password, {
    role: "PARTNER",
    name: "Marc Dubois",
    organization_name: "Confluence Bureaux",
    organization_siret: "98765432100013",
    organization_address: "5 quai Perrache",
    organization_city: "Lyon",
    organization_postal_code: "69002",
  });

  await ensureUser(admin, CLIENT.email, CLIENT.password, {
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

  console.log("\nDemo accounts:");
  console.log(`  Admin:            ${ADMIN.email} / ${ADMIN.password}`);
  console.log(`  Partner (Paris):  ${PARTNER_PARIS.email} / ${PARTNER_PARIS.password}`);
  console.log(`  Partner (Lyon):   ${PARTNER_LYON.email} / ${PARTNER_LYON.password}`);
  console.log(`  Client:           ${CLIENT.email} / ${CLIENT.password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
