import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appUrl, escapeHtml, renderEmail } from "@/server/domains/notifications/layout";
import * as templates from "@/server/domains/notifications/templates";
import type { BookingEmailContext } from "@/server/domains/notifications/templates";

/**
 * FCT-12 — every e-mail has an HTML version built from one escaped layout.
 * The payload below is what a hostile landlord or client could type into a
 * space name, a description or their own name.
 */
const XSS = `<script>alert("x")</script><img src=x onerror=alert(1)>&"'`;

const booking: BookingEmailContext = {
  clientEmail: "client@test.local",
  clientName: XSS,
  partnerEmail: "host@test.local",
  partnerOrgName: XSS,
  spaceName: XSS,
  spaceAddress: XSS,
  spaceCity: "Paris",
  spacePostalCode: "75001",
  accessInstructions: `Code 1234\n${XSS}`,
  startsAt: new Date("2026-12-01T09:00:00Z"),
  endsAt: new Date("2026-12-01T13:00:00Z"),
  priceAmountCents: 12000,
};
const cancellation = { ...booking, refundAmountCents: 12000, beforeCapture: false };

const all = () => [
  templates.bookingRequestedTemplate(booking),
  templates.bookingRequestReceivedTemplate(booking),
  templates.bookingConfirmedTemplate(booking),
  templates.bookingRejectedTemplate(booking),
  templates.bookingExpiredTemplate(booking),
  templates.bookingReminderTemplate(booking),
  templates.bookingCancelledByClientTemplate(cancellation),
  templates.bookingCancelledByClientNoticeTemplate(cancellation),
  templates.bookingCancelledByLandlordTemplate(cancellation),
  templates.bookingCancelledByLandlordNoticeTemplate(cancellation),
  templates.newMessageTemplate({ to: "a@test.local", senderLabel: XSS, spaceName: XSS, bookingId: "b-1" }),
  templates.verificationApprovedTemplate({ to: "a@test.local", organizationName: XSS }),
  templates.verificationRejectedTemplate({ to: "a@test.local", organizationName: XSS, reason: XSS }),
  templates.spacePublishedTemplate({ to: "a@test.local", spaceName: XSS }),
  templates.spaceRejectedTemplate({ to: "a@test.local", spaceName: XSS, reason: XSS }),
  templates.spaceUnpublishedTemplate({ to: "a@test.local", spaceName: XSS, reason: XSS }),
  templates.organizationSuspendedTemplate({ to: "a@test.local", organizationName: XSS, reason: XSS }),
  templates.organizationReactivatedTemplate({ to: "a@test.local", organizationName: XSS }),
  templates.disputeOpenedTemplate({
    to: "a@test.local",
    audience: "party",
    spaceName: XSS,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    bookingId: "b-1",
    raisedByLabel: XSS,
  }),
  templates.disputeResolvedTemplate({ to: "a@test.local", spaceName: XSS, outcome: "REFUND", notes: XSS, refundAmountCents: 500 }),
  templates.refundIssuedTemplate({ to: "a@test.local", clientName: XSS, spaceName: XSS, amountCents: 500 }),
  templates.commissionStatementIssuedTemplate({
    to: "a@test.local",
    organizationName: XSS,
    periodLabel: "octobre 2026",
    totalCommissionAmountCents: 1500,
  }),
  templates.chargebackReceivedTemplate({
    to: "a@test.local",
    audience: "admin",
    organizationName: XSS,
    spaceName: XSS,
    amountCents: 500,
    reason: XSS,
  }),
  templates.supportTicketAckTemplate({ to: "a@test.local", ticketId: "abcdef12-0000" }),
  templates.supportReplyTemplate({ to: "a@test.local", ticketId: "abcdef12-0000", subject: XSS, reply: XSS }),
];

beforeEach(() => {
  process.env.APP_URL = "https://app.officeflex.test";
});
afterEach(() => {
  delete process.env.APP_URL;
});

describe("e-mail layout", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("never lets user data inject markup, in any template", () => {
    for (const email of all()) {
      expect(email.html).not.toContain("<script>");
      expect(email.html).not.toContain("<img");
      expect(email.html).not.toMatch(/<[^>]*onerror/i);
    }
  });

  it("keeps the escaped text visible in the HTML (escaped, not dropped)", () => {
    const html = templates.spacePublishedTemplate({ to: "a@test.local", spaceName: XSS }).html;
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("every template has a subject, a text and a branded table-based HTML version", () => {
    for (const email of all()) {
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.subject).not.toMatch(/[\r\n]/);
      expect(email.text.length).toBeGreaterThan(0);
      expect(email.html).toContain("<table");
      expect(email.html).toContain("#041627");
      expect(email.html).toContain("#C5A059");
      expect(email.html).toContain("Office</span>");
      // Footer: legal line and contact link.
      expect(email.html).toContain("https://app.officeflex.test/contact");
      expect(email.text).toContain("https://app.officeflex.test/contact");
    }
  });

  it("buttons point to APP_URL, in both versions", () => {
    const email = templates.bookingConfirmedTemplate(booking);
    expect(email.html).toContain('href="https://app.officeflex.test/app/bookings"');
    expect(email.text).toContain("https://app.officeflex.test/app/bookings");
  });

  it("refuses to build a link that is not an app-relative path", () => {
    expect(() => appUrl("//evil.example")).toThrow();
    expect(() => appUrl("https://evil.example")).toThrow();
    expect(appUrl("/search")).toBe("https://app.officeflex.test/search");
  });

  it("strips line breaks from a subject carrying user data", () => {
    const email = renderEmail("a@test.local", "Hello\r\nBcc: x@evil.example", { paragraphs: ["x"] });
    expect(email.subject).toBe("Hello Bcc: x@evil.example");
  });
});

describe("e-mail content", () => {
  it("the confirmation carries the host's contact details and the access instructions", () => {
    const email = templates.bookingConfirmedTemplate({ ...booking, partnerOrgName: "Hôte SAS", accessInstructions: "Code 1234" });
    expect(email.text).toContain("Hôte SAS");
    expect(email.text).toContain("host@test.local");
    expect(email.text).toContain("Code 1234");
    expect(email.html).toContain("host@test.local");
  });

  it("the new-message notification never contains the message itself", () => {
    const email = templates.newMessageTemplate({ to: "a@test.local", senderLabel: "Jeanne", spaceName: "Salle", bookingId: "b-1" });
    expect(email.text).toContain("/app/messages/b-1");
    expect(email.text).toMatch(/contenu du message n'est pas repris/);
  });

  it("the support acknowledgment repeats nothing the visitor typed (no spam relay)", () => {
    const email = templates.supportTicketAckTemplate({ to: "a@test.local", ticketId: "abcdef12-3456" });
    expect(email.text).toContain("ABCDEF12");
    expect(email.subject).toBe("Nous avons bien reçu votre message");
  });

  it("the rejection reason reaches the landlord", () => {
    const email = templates.verificationRejectedTemplate({ to: "a@test.local", organizationName: "Org", reason: "Kbis illisible" });
    expect(email.text).toContain("Motif : Kbis illisible");
  });
});
