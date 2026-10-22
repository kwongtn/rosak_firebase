import { describe, expect, it } from "vitest";

import type { CalendarIncident } from "./insiden.queries";
import { IncidentSheetService } from "./incident-sheet.service";

describe("IncidentSheetService", () => {
  const incident = { id: "7", title: "KL Sentral flood" } as CalendarIncident;

  it("opens in edit mode for an incident and in create mode without one", () => {
    const service = new IncidentSheetService();

    service.open(incident);
    expect(service.isOpen()).toBe(true);
    expect(service.editTarget()).toBe(incident);

    service.open();
    expect(service.editTarget()).toBeNull();
  });

  it("drops the edit target on close, so a form created later cannot hydrate an abandoned edit", () => {
    const service = new IncidentSheetService();
    service.open(incident);

    service.close();

    expect(service.isOpen()).toBe(false);
    expect(service.editTarget()).toBeNull();
  });

  it("drops it on setOpen(false) too, the path the sheet's own Escape and backdrop take", () => {
    const service = new IncidentSheetService();
    service.open(incident);

    service.setOpen(false);

    expect(service.editTarget()).toBeNull();
  });
});
