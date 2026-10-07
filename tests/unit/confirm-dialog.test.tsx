// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

afterEach(cleanup);

function renderDialog(onConfirm: () => Promise<string | null | void>) {
  render(
    <ConfirmDialog
      trigger={<button type="button">Supprimer</button>}
      title="Supprimer cette photo ?"
      description="La photo est supprimée définitivement."
      confirmLabel="Supprimer la photo"
      onConfirm={onConfirm}
    />
  );
}

async function openAndConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
  const dialog = await screen.findByRole("alertdialog");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Supprimer la photo" }));
  });
  return dialog;
}

describe("ConfirmDialog", () => {
  it("does nothing until the action is confirmed", async () => {
    const onConfirm = vi.fn().mockResolvedValue(null);
    renderDialog(onConfirm);

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action and closes on success", async () => {
    const onConfirm = vi.fn().mockResolvedValue(null);
    renderDialog(onConfirm);

    await openAndConfirm();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("shows the error and stays open when the action fails", async () => {
    renderDialog(vi.fn().mockResolvedValue("La photo n'a pas pu être supprimée."));

    await openAndConfirm();

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("La photo n'a pas pu être supprimée.");
  });

  it("shows a thrown error instead of swallowing it", async () => {
    renderDialog(vi.fn().mockRejectedValue(new Error("Réseau indisponible")));

    await openAndConfirm();

    expect(screen.getByRole("alert").textContent).toBe("Réseau indisponible");
  });
});
