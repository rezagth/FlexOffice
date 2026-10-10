import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Lot C (audit 06/10/2026) against a real database: re-moderation of an
 * edited listing, unpublishing, closures over bookings, account and
 * organization suspension, support replies, the J-1 reminder, Stripe
 * dispute ordering. E-mails go through a recording provider.
 */

const sent = vi.hoisted(() => [] as Array<{ to: string; subject: string; text: string; html?: string }>);
const sessionUser = vi.hoisted(() => ({ id: null as string | null }));

vi.mock("@/server/domains/notifications/get-email-provider", () => ({
  getEmailProvider: () => ({
    name: "test",
    send: async (message: { to: string; subject: string; text: string; html?: string }) => {
      sent.push(message);
      return { id: `test_${sent.length}` };
    },
  }),
}));

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () =>
        sessionUser.id
          ? { data: { user: { id: sessionUser.id } }, error: null }
          : { data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } },
    },
  }),
}));

describe.skipIf(!hasDatabase)("lot C — moderation, suspension, support, reminders", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let fixtures: typeof import("./helpers/test-fixtures");
  let errors: typeof import("@/server/lib/errors");

  let landlordId: string;
  let clientId: string;
  let adminId: string;
  let orgId: string;
  let propertyId: string;
  const createdUsers: string[] = [];

  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);

  async function insertBooking(
    spaceId: string,
    opts: { status: "CONFIRMED" | "PENDING" | "CANCELLED"; startsAt: Date; endsAt: Date }
  ) {
    return prisma.booking.create({
      data: {
        spaceId,
        organizationId: orgId,
        clientUserId: clientId,
        startsAt: opts.startsAt,
        endsAt: opts.endsAt,
        status: opts.status,
        participantsCount: 2,
        purpose: "Test",
        priceAmountCents: 10000,
        commissionAmountCents: 1500,
      },
    });
  }

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    delete process.env.OFFICEFLEX_DEMO_MODE;
    process.env.ADMIN_ALERT_EMAIL = "ops@test.local";

    ({ prisma } = await import("@/server/db/prisma"));
    fixtures = await import("./helpers/test-fixtures");
    errors = await import("@/server/lib/errors");

    const [landlord, client, admin] = await Promise.all([
      fixtures.createTestUser({ role: "CLIENT", name: "Lot C Landlord" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Lot C Client" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Lot C Admin" }),
    ]);
    landlordId = landlord.id;
    clientId = client.id;
    adminId = admin.id;
    createdUsers.push(landlordId, clientId, adminId);
    await prisma.profile.update({ where: { id: adminId }, data: { platformRole: "ADMIN" } });

    const org = await fixtures.createTestOrganization({ name: "Lot C Org" });
    orgId = org.id;
    await prisma.organization.update({ where: { id: orgId }, data: { status: "VERIFIED" } });
    await prisma.organizationMember.create({ data: { organizationId: orgId, profileId: landlordId, orgRole: "OWNER" } });
    const property = await fixtures.createTestProperty(orgId, landlordId);
    propertyId = property.id;
  });

  beforeEach(() => {
    sent.length = 0;
    sessionUser.id = null;
  });

  afterAll(async () => {
    delete process.env.ADMIN_ALERT_EMAIL;
  });

  // -------------------------------------------------------------------------
  describe("FCT-15 / SEC-09 — re-moderation of an edited published listing", () => {
    it("a public field change sends the listing back to PENDING_REVIEW (out of the catalogue)", async () => {
      const { updateSpace } = await import("@/server/domains/organizations/update-space");
      const space = await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });

      const updated = await updateSpace(orgId, space.id, { description: "Nouvelle description" }, landlordId);
      expect(updated.status).toBe("PENDING_REVIEW");

      const audit = await prisma.auditLog.findFirst({
        where: { event: "space.back_to_review", organizationId: orgId },
        orderBy: { createdAt: "desc" },
      });
      expect(audit?.metadata).toMatchObject({ spaceId: space.id, changedFields: ["description"] });
    });

    it("re-sending unchanged values or editing a non-public field keeps it published", async () => {
      const { updateSpace } = await import("@/server/domains/organizations/update-space");
      const space = await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });
      const updated = await updateSpace(orgId, space.id, {
        name: space.name,
        dayPriceCents: space.dayPriceCents,
        accessInstructions: "Badge à l'accueil",
      });
      expect(updated.status).toBe("PUBLISHED");
    });

    it("the property-scoped edit path applies the same rule", async () => {
      const { updateSpaceViaProperty } = await import("@/server/domains/properties/spaces");
      const space = await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });
      const ctx = { userId: landlordId, activeOrgId: orgId } as Parameters<typeof updateSpaceViaProperty>[1];
      const updated = await updateSpaceViaProperty(space.id, ctx, { halfDayPriceCents: 13000 });
      expect(updated.status).toBe("PENDING_REVIEW");
    });

    it("a partial discount update is checked against the stored prices (1,00 € minimum)", async () => {
      const { updateSpace } = await import("@/server/domains/organizations/update-space");
      const space = await fixtures.createTestSpace(orgId, propertyId, { status: "DRAFT" });
      await prisma.space.update({ where: { id: space.id }, data: { halfDayPriceCents: 500 } });
      await expect(updateSpace(orgId, space.id, { discountPercent: 90 })).rejects.toBeInstanceOf(errors.ValidationError);
      const fresh = await prisma.space.findUniqueOrThrow({ where: { id: space.id } });
      expect(fresh.discountPercent).toBeNull();
    });

    it("the database refuses a discount above 90 %", async () => {
      const space = await fixtures.createTestSpace(orgId, propertyId, { status: "DRAFT" });
      await expect(
        prisma.space.update({ where: { id: space.id }, data: { discountPercent: 95 } })
      ).rejects.toThrow(/spaces_discount_percent_max_check/);
    });

    it("an admin can unpublish a listing with a reason, e-mailed to the landlord", async () => {
      const { unpublishSpace, publishSpace } = await import("@/server/domains/organizations/moderate-space");
      const space = await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });
      await unpublishSpace(adminId, space.id, "Photos trompeuses");
      expect((await prisma.space.findUniqueOrThrow({ where: { id: space.id } })).status).toBe("REJECTED");
      const mail = sent.find((m) => m.subject.startsWith("Votre annonce a été retirée"));
      expect(mail?.text).toContain("Photos trompeuses");
      expect(mail?.html).toContain("Photos trompeuses");

      // Not published any more: unpublishing twice is a conflict, publishing
      // directly from REJECTED is not possible either.
      await expect(unpublishSpace(adminId, space.id, "x x x")).rejects.toBeInstanceOf(errors.ConflictError);
      await expect(publishSpace(adminId, space.id)).rejects.toBeInstanceOf(errors.ConflictError);
    });
  });

  // -------------------------------------------------------------------------
  describe("FCT-25 — closures over existing bookings", () => {
    it("refuses (409) a closure overlapping a confirmed booking, and lists it", async () => {
      const { createClosure } = await import("@/server/domains/organizations/closures");
      const space = await fixtures.createTestSpace(orgId, propertyId);
      await insertBooking(space.id, { status: "CONFIRMED", startsAt: hoursFromNow(48), endsAt: hoursFromNow(52) });

      const attempt = createClosure(orgId, space.id, {
        startsAt: hoursFromNow(24),
        endsAt: hoursFromNow(72),
        reason: "Travaux",
      });
      await expect(attempt).rejects.toBeInstanceOf(errors.ConflictError);
      await expect(attempt).rejects.toThrow(/Lot C Client, confirmée/);
      expect(await prisma.spaceClosure.count({ where: { spaceId: space.id } })).toBe(0);
    });

    it("a pending request blocks it too; a cancelled booking or a disjoint range does not", async () => {
      const { createClosure } = await import("@/server/domains/organizations/closures");
      const space = await fixtures.createTestSpace(orgId, propertyId);
      await insertBooking(space.id, { status: "PENDING", startsAt: hoursFromNow(100), endsAt: hoursFromNow(104) });
      await insertBooking(space.id, { status: "CANCELLED", startsAt: hoursFromNow(200), endsAt: hoursFromNow(204) });

      await expect(
        createClosure(orgId, space.id, { startsAt: hoursFromNow(99), endsAt: hoursFromNow(101), reason: "x" })
      ).rejects.toThrow(/demande en attente/);
      const ok = await createClosure(orgId, space.id, {
        startsAt: hoursFromNow(150),
        endsAt: hoursFromNow(250),
        reason: "Congés",
      });
      expect(ok.id).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  describe("FCT-16 — account suspension", () => {
    it("a suspended account has no session; reactivation restores it", async () => {
      const { suspendUser, reactivateUser } = await import("@/server/domains/admin/users");
      const { getAuthContext } = await import("@/server/auth/rbac");
      const victim = await fixtures.createTestUser({ role: "CLIENT", name: "To Suspend" });
      createdUsers.push(victim.id);

      sessionUser.id = victim.id;
      expect((await getAuthContext())?.userId).toBe(victim.id);

      const result = await suspendUser(adminId, victim.id, "Fraude à la carte");
      expect(result.changed).toBe(true);
      expect(await getAuthContext()).toBeNull();

      // Idempotent: suspending again changes nothing.
      expect((await suspendUser(adminId, victim.id, "encore")).changed).toBe(false);

      await reactivateUser(adminId, victim.id);
      expect((await getAuthContext())?.userId).toBe(victim.id);

      const events = await prisma.auditLog.findMany({
        where: { actorUserId: adminId, event: { in: ["user.suspended", "user.reactivated"] } },
      });
      expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(["user.suspended", "user.reactivated"]));
    });

    it("an administrator cannot suspend themselves", async () => {
      const { suspendUser } = await import("@/server/domains/admin/users");
      await expect(suspendUser(adminId, adminId, "test")).rejects.toBeInstanceOf(errors.ForbiddenError);
      const admin = await prisma.profile.findUniqueOrThrow({ where: { id: adminId } });
      expect(admin.suspendedAt).toBeNull();
    });

    it("searches accounts by e-mail or name", async () => {
      const { listUsers } = await import("@/server/domains/admin/users");
      const { users } = await listUsers({ query: "lot c client", page: 1 });
      expect(users.map((u) => u.id)).toContain(clientId);
      expect(users[0]).not.toHaveProperty("phone");
    });
  });

  // -------------------------------------------------------------------------
  describe("FCT-16 — organization suspension", () => {
    it("suspends (listings leave the catalogue) and reactivates to the status its dossier supports", async () => {
      const { suspendOrganization, reactivateOrganization } = await import(
        "@/server/domains/organizations/suspension"
      );
      const org = await fixtures.createTestOrganization({ name: "Suspended Org" });
      await prisma.organization.update({ where: { id: org.id }, data: { status: "VERIFIED" } });

      await suspendOrganization(adminId, org.id, "Annonces frauduleuses");
      expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("SUSPENDED");
      expect(sent.some((m) => m.subject === "Votre compte bailleur est suspendu" && m.text.includes("frauduleuses"))).toBe(true);

      // No approved dossier behind it: back to PENDING_VERIFICATION, not VERIFIED.
      const result = await reactivateOrganization(adminId, org.id);
      expect(result.status).toBe("PENDING_VERIFICATION");
    });

    it("approving a verification dossier never lifts a suspension", async () => {
      const { approveVerification } = await import("@/server/domains/verification/review");
      const owner = await fixtures.createTestUser({ role: "CLIENT", name: "Dossier owner" });
      createdUsers.push(owner.id);
      const org = await fixtures.createTestOrganization({ name: "Dossier Org" });
      await prisma.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
      const verification = await prisma.landlordVerification.create({
        data: {
          organizationId: org.id,
          requestedByProfileId: owner.id,
          activityType: "OWNER",
          status: "PENDING_REVIEW",
        },
      });
      await approveVerification(verification.id, adminId);
      expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("SUSPENDED");
      expect(sent.some((m) => m.subject === "Votre dossier bailleur est validé")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("FCT-16 — support replies", () => {
    it("stores the reply, e-mails it, records emailedAt and can close the ticket", async () => {
      const { createTicket, replyToTicket, listTicketReplies } = await import("@/server/domains/support/tickets");
      const ticket = await createTicket(
        { email: "visitor@test.local", subject: "<b>Facture</b>", message: "Où est ma facture ?" },
        null
      );
      // Acknowledgment: reference only, nothing the visitor typed.
      const ack = sent.find((m) => m.to === "visitor@test.local");
      expect(ack?.subject).toBe("Nous avons bien reçu votre message");
      expect(ack?.text).not.toContain("Facture");

      const { reply, emailed } = await replyToTicket({
        ticketId: ticket.id,
        actorUserId: adminId,
        body: "Elle est dans votre espace, rubrique Factures.",
        close: true,
      });
      expect(emailed).toBe(true);
      expect(reply.emailedAt).not.toBeNull();
      const mail = sent.find((m) => m.subject.startsWith("Réponse à votre demande"));
      expect(mail?.to).toBe("visitor@test.local");
      expect(mail?.html).toContain("&lt;b&gt;Facture&lt;/b&gt;");

      const history = await listTicketReplies(ticket.id);
      expect(history).toHaveLength(1);
      expect(history[0].author?.name).toBe("Lot C Admin");
      expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("CLOSED");
    });

    it("answers 404 for an unknown ticket", async () => {
      const { replyToTicket } = await import("@/server/domains/support/tickets");
      await expect(
        replyToTicket({ ticketId: "00000000-0000-4000-8000-000000000000", actorUserId: adminId, body: "x" })
      ).rejects.toBeInstanceOf(errors.NotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  describe("FCT-12 — J-1 reminder", () => {
    it("is sent once per confirmed booking starting within 24 h, whatever the number of runs", async () => {
      const { sendDueBookingReminders } = await import("@/server/domains/notifications/booking-reminders");
      const space = await fixtures.createTestSpace(orgId, propertyId);
      const due = await insertBooking(space.id, { status: "CONFIRMED", startsAt: hoursFromNow(20), endsAt: hoursFromNow(24) });
      const later = await insertBooking(space.id, { status: "CONFIRMED", startsAt: hoursFromNow(60), endsAt: hoursFromNow(64) });
      const pending = await insertBooking(space.id, { status: "PENDING", startsAt: hoursFromNow(10), endsAt: hoursFromNow(12) });

      await Promise.all([sendDueBookingReminders(), sendDueBookingReminders()]);
      await sendDueBookingReminders();

      const reminders = sent.filter((m) => m.subject.startsWith("Rappel : votre réservation demain"));
      const forThisSpace = reminders.filter((m) => m.text.includes(space.name));
      expect(forThisSpace).toHaveLength(1);
      expect(forThisSpace[0].to).toBe((await prisma.profile.findUniqueOrThrow({ where: { id: clientId } })).email);

      expect((await prisma.booking.findUniqueOrThrow({ where: { id: due.id } })).reminderSentAt).not.toBeNull();
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: later.id } })).reminderSentAt).toBeNull();
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: pending.id } })).reminderSentAt).toBeNull();
    });

    it("runs as part of the scheduled maintenance", async () => {
      const { runBookingMaintenance } = await import("@/server/domains/bookings/expire-stale");
      const result = await runBookingMaintenance();
      expect(result).toHaveProperty("reminders");
    });
  });

  // -------------------------------------------------------------------------
  describe("FCT-21 / SEC-17 — Stripe disputes", () => {
    it("never downgrades a status and alerts only on creation", async () => {
      const { recordDisputeEvent } = await import("@/server/domains/payments/disputes");
      const space = await fixtures.createTestSpace(orgId, propertyId);
      const booking = await insertBooking(space.id, { status: "CONFIRMED", startsAt: hoursFromNow(300), endsAt: hoursFromNow(304) });
      const payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          organizationId: orgId,
          provider: "stripe",
          providerPaymentIntentId: `pi_${booking.id}`,
          amountCents: 10000,
          commissionAmountCents: 1500,
          netAmountCents: 8500,
          status: "SUCCEEDED",
          capturedAt: new Date(),
        },
      });
      const disputeId = `dp_${booking.id}`;
      const event = (status: string) => ({
        id: disputeId,
        payment_intent: payment.providerPaymentIntentId,
        amount: 10000,
        reason: "fraudulent",
        status,
      });

      await recordDisputeEvent(event("needs_response"));
      await recordDisputeEvent(event("needs_response")); // retry
      await recordDisputeEvent(event("won"));
      await recordDisputeEvent(event("under_review")); // late, older event

      const row = await prisma.stripeDispute.findUniqueOrThrow({ where: { providerDisputeId: disputeId } });
      expect(row.status).toBe("WON");

      const alerts = sent.filter((m) => m.subject.startsWith("Contestation de paiement"));
      expect(alerts).toHaveLength(2); // landlord + ADMIN_ALERT_EMAIL, once
      expect(alerts.some((m) => m.to === "ops@test.local")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("FCT-12 — messages and disputes notify the other side", () => {
    it("a message notifies the other party without its content, once per burst", async () => {
      const { sendMessage } = await import("@/server/domains/messaging/conversation");
      const space = await fixtures.createTestSpace(orgId, propertyId);
      const booking = await insertBooking(space.id, { status: "CONFIRMED", startsAt: hoursFromNow(400), endsAt: hoursFromNow(404) });

      await sendMessage({ bookingId: booking.id, userId: clientId, activeOrgId: null, body: "Code secret 9999" });
      await sendMessage({ bookingId: booking.id, userId: clientId, activeOrgId: null, body: "Et le parking ?" });

      const notices = sent.filter((m) => m.subject.startsWith("Nouveau message"));
      expect(notices).toHaveLength(1);
      expect(notices[0].text).not.toContain("9999");
      expect(notices[0].html).not.toContain("9999");
      expect(notices[0].text).toContain(`/app/messages/${booking.id}`);
    });

    it("a dispute is announced to both parties and to the operators", async () => {
      const { raiseDispute } = await import("@/server/domains/disputes/raise");
      const space = await fixtures.createTestSpace(orgId, propertyId);
      const booking = await insertBooking(space.id, { status: "CONFIRMED", startsAt: hoursFromNow(500), endsAt: hoursFromNow(504) });
      await raiseDispute({ bookingId: booking.id, actorUserId: clientId, activeOrgId: null, description: "Salle sale" });

      const notices = sent.filter((m) => m.subject.startsWith("Litige ouvert"));
      expect(notices).toHaveLength(3);
      expect(notices.some((m) => m.to === "ops@test.local" && m.text.includes("/admin/disputes"))).toBe(true);
    });
  });
});
