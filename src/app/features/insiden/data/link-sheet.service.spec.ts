import { describe, expect, it } from "vitest";

import { LinkSheetService } from "./link-sheet.service";

describe("LinkSheetService prefill", () => {
  it("keeps open() backward compatible and defaults the prefill to null", () => {
    const service = new LinkSheetService();

    service.open();

    expect(service.isOpen()).toBe(true);
    expect(service.context()).toBeNull();
    expect(service.prefillUrl()).toBeNull();
  });

  it("stores a trimmed prefill and consumes it exactly once", () => {
    const service = new LinkSheetService();

    service.open(undefined, { url: "  https://example.com/story  " });

    expect(service.prefillUrl()).toBe("https://example.com/story");
    expect(service.takePrefillUrl()).toBe("https://example.com/story");
    expect(service.prefillUrl()).toBeNull();
    expect(service.takePrefillUrl()).toBeNull();
  });

  it("treats an empty or whitespace-only prefill url as no prefill", () => {
    const service = new LinkSheetService();

    service.open(undefined, { url: "   " });

    expect(service.prefillUrl()).toBeNull();
  });

  it("clears any pending prefill when opening in edit mode", () => {
    const service = new LinkSheetService();
    service.open(undefined, { url: "https://example.com/story" });

    service.openEdit({ id: "1", url: "https://x.com/1", title: "t", lines: [] });

    expect(service.editTarget()).not.toBeNull();
    expect(service.prefillUrl()).toBeNull();
  });

  it("clears an unconsumed prefill on close() and setOpen(false)", () => {
    const service = new LinkSheetService();

    service.open(undefined, { url: "https://example.com/story" });
    service.close();
    expect(service.prefillUrl()).toBeNull();

    service.open(undefined, { url: "https://example.com/story" });
    service.setOpen(false);
    expect(service.prefillUrl()).toBeNull();
  });

  it("still sets the incident context on open()", () => {
    const service = new LinkSheetService();

    service.open({ incidentId: "7", incidentTitle: "KL Sentral flood" });

    expect(service.context()).toEqual({ incidentId: "7", incidentTitle: "KL Sentral flood" });
    expect(service.prefillUrl()).toBeNull();
  });
});
