// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { BookingRequestActions } = await import("@/components/dashboard/booking-request-actions");

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function refuse(reason?: string) {
  render(<BookingRequestActions bookingId="b-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
  await screen.findByRole("alertdialog");
  if (reason) {
    fireEvent.change(screen.getByLabelText("Motif (facultatif)"), { target: { value: reason } });
  }
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Refuser la demande" }));
  });
}

describe("BookingRequestActions — refusing a request", () => {
  it("asks for confirmation before calling the reject endpoint", async () => {
    render(<BookingRequestActions bookingId="b-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
    await screen.findByRole("alertdialog");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses without sending a message when no reason is given", async () => {
    fetchMock.mockResolvedValue(json(200, { pending: false }));
    await refuse();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/partner/bookings/b-1/reject");
    expect(refresh).toHaveBeenCalled();
  });

  it("sends the reason to the booking conversation, then refuses", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { message: {} })).mockResolvedValueOnce(json(200, {}));
    await refuse("Travaux ce jour-là");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/bookings/b-1/messages");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      body: "Motif du refus : Travaux ce jour-là",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/partner/bookings/b-1/reject");
  });

  it("does not refuse when the reason could not be sent, and says so", async () => {
    fetchMock.mockResolvedValueOnce(json(429, { error: { code: "RATE_LIMITED", message: "Trop de messages." } }));
    await refuse("Travaux");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe("Trop de messages.");
  });

  it("shows the API error when the refusal fails", async () => {
    fetchMock.mockResolvedValue(
      json(409, { error: { code: "CONFLICT", message: "Cette demande a déjà été traitée." } })
    );
    await refuse();

    expect(screen.getByRole("alert").textContent).toBe("Cette demande a déjà été traitée.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
