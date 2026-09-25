import { Component, provideZonelessChangeDetection } from "@angular/core";
import {
  bootstrapApplication,
  provideClientHydration,
  type BootstrapContext,
} from "@angular/platform-browser";
import { renderApplication, ɵENABLE_DOM_EMULATION } from "@angular/platform-server";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PASSENGER_INFO, passengerScale } from "../data/status-info.util";
import { StatusInfoChipComponent } from "./status-info-chip.component";

/**
 * The existing DOM specs cannot catch this failure: the chip renders fine under `TestBed`, and the
 * bug only surfaces when the real platform-server renderer annotates the DOM for hydration — the
 * chip projects `<div popoverExtra>` into a panel that `InfoPopover` renders inside `@if (_open())`
 * (false on the server), so the projected node is orphaned and serialization throws NG0502
 * mid-stream (HTTP 200 + 22-byte "Internal server error."). These run the actual server render path
 * (`renderApplication` + `provideClientHydration`). DOM emulation is disabled so the spec reuses
 * the shared jsdom document instead of `DominoAdapter.makeCurrent()`, which would overwrite the
 * global DOM constructors for every later test file (the runner shares one environment).
 */
@Component({
  selector: "app-server-chip-host",
  imports: [StatusInfoChipComponent],
  template: `
    <app-status-info-chip
      [info]="info"
      [scale]="scale"
      [windowMinutes]="15"
      linkFragment="sightings"
    >
      <span data-testid="passenger-status">Crowded</span>
    </app-status-info-chip>
  `,
})
class ServerChipHost {
  readonly info = PASSENGER_INFO.CROWDED;
  readonly scale = passengerScale("CROWDED");
}

function serverHtml(): Promise<string> {
  return renderApplication(
    (context: BootstrapContext) =>
      bootstrapApplication(
        ServerChipHost,
        {
          providers: [
            provideZonelessChangeDetection(),
            provideRouter([]),
            provideClientHydration(),
          ],
        },
        context,
      ),
    {
      // A non-empty string makes platform-server reuse the ambient jsdom document (the content is
      // ignored when DOM emulation is off); the host element is seeded in `beforeEach`.
      document: "<app-server-chip-host></app-server-chip-host>",
      platformProviders: [{ provide: ɵENABLE_DOM_EMULATION, useValue: false }],
    },
  );
}

describe("StatusInfoChipComponent (server render)", () => {
  beforeEach(() => {
    document.body.innerHTML = "<app-server-chip-host></app-server-chip-host>";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("serializes the projected chip without a hydration error", async () => {
    const html = await serverHtml();

    expect(html).toContain('data-testid="passenger-status"');
  });
});
