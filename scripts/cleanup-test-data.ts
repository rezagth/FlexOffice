/**
 * Supprime les données créées par les tests d'intégration avant la mise en prod.
 *
 *   pnpm cleanup:test-data            # simulation : compte et liste, ne supprime rien
 *   pnpm cleanup:test-data --confirm  # supprime réellement
 *
 * Cible UNIQUEMENT :
 *   - auth.users dont l'email finit par @test.officeflex.local (fixtures des tests)
 *   - organizations dont l'email finit par @test.local (fixtures des tests)
 * Les comptes de démonstration / réels ne sont jamais touchés : ils sont listés
 * à titre d'information pour que tu les vérifies toi-même.
 * Chaque suppression est indépendante : un échec (clé étrangère RESTRICT) est
 * signalé sans bloquer le reste. Suppression définitive : vérifie DATABASE_URL.
 */
import "dotenv/config";
import { prisma } from "../src/server/db/prisma";

const TEST_USER_SUFFIX = "%@test.officeflex.local";
const TEST_ORG_SUFFIX = "%@test.local";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const database = (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@");
  console.log(`Base : ${database || "(DATABASE_URL absente)"}`);

  const users = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
    `SELECT id, email FROM auth.users WHERE email LIKE $1`, TEST_USER_SUFFIX);
  const orgs = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT id, name FROM organizations WHERE email LIKE $1`, TEST_ORG_SUFFIX);
  const others = await prisma.$queryRawUnsafe<Array<{ email: string }>>(
    `SELECT email FROM auth.users WHERE email NOT LIKE $1 ORDER BY created_at`, TEST_USER_SUFFIX);

  console.log(`Utilisateurs de test : ${users.length}`);
  console.log(`Organisations de test : ${orgs.length}`);
  console.log(`Autres comptes (NON touchés, à vérifier) : ${others.length}`);
  for (const o of others) console.log(`  - ${o.email}`);

  if (!confirm) {
    console.log("\nSimulation : ajoute --confirm pour supprimer.");
    return;
  }

  let userOk = 0, userFail = 0, orgOk = 0, orgFail = 0;
  for (const u of users) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`DELETE FROM landlord_verifications WHERE requested_by_profile_id = $1::uuid`, u.id);
        await tx.$executeRawUnsafe(`DELETE FROM properties WHERE created_by_profile_id = $1::uuid`, u.id);
        await tx.$executeRawUnsafe(`DELETE FROM property_owners WHERE profile_id = $1::uuid`, u.id);
        await tx.$executeRawUnsafe(`DELETE FROM property_operators WHERE profile_id = $1::uuid`, u.id);
        await tx.$executeRawUnsafe(`DELETE FROM property_managers WHERE profile_id = $1::uuid`, u.id);
        await tx.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = $1::uuid`, u.id);
      });
      userOk++;
    } catch (e) {
      userFail++;
      console.warn(`Échec utilisateur ${u.email} : ${(e as Error).message.split("\n")[0]}`);
    }
  }
  for (const o of orgs) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM organizations WHERE id = $1::uuid`, o.id);
      orgOk++;
    } catch (e) {
      orgFail++;
      console.warn(`Échec organisation ${o.name} : ${(e as Error).message.split("\n")[0]}`);
    }
  }
  console.log(`\nUtilisateurs supprimés ${userOk}/${users.length} (échecs ${userFail}) ; organisations ${orgOk}/${orgs.length} (échecs ${orgFail}).`);
}

main().finally(() => prisma.$disconnect());
