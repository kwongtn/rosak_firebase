import { Component, provideZonelessChangeDetection } from "@angular/core";
import {
  HttpBackend,
  HttpResponse,
  provideHttpClient,
  type HttpEvent,
  type HttpRequest,
} from "@angular/common/http";
import {
  bootstrapApplication,
  provideClientHydration,
  withHttpTransferCacheOptions,
  type BootstrapContext,
} from "@angular/platform-browser";
import { renderApplication, ɵENABLE_DOM_EMULATION } from "@angular/platform-server";
import { Observable, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { LinkSheetComponent } from "./link-sheet.component";

/**
 * The closed link sheet is mounted by Home, /insiden and every line's Situasi tab, and its form
 * runs a fleet-wide reference read the moment it is created. This runs the real server render path
 * (`renderApplication` + `provideClientHydration`, as the status-info-chip server spec does, with
 * DOM emulation off so it reuses the shared jsdom document) to pin two things a `TestBed` spec
 * cannot: that nothing queries the API while the sheet is closed — what keeps the reference data out
 * of TransferState — and that a `@defer` block inside content projected into an unopened HlmSheet
 * serialises for hydration without error (the orphaned-projection failure that spec documents).
 */
@Component({
  selector: "app-server-link-sheet-host",
  imports: [LinkSheetComponent],
  template: `<app-link-sheet />`,
})
class ServerLinkSheetHost {}

function serverHtml(requests: string[]): Promise<string> {
  // A recording backend instead of the network: if the form were created, its read would land here
  // (and the spec fail) rather than reach a real API.
  const backend = {
    handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
      requests.push(`${request.method} ${request.url}`);
      return of(new HttpResponse({ status: 200, body: { data: {} } }));
    },
  };
  return renderApplication(
    (context: BootstrapContext) =>
      bootstrapApplication(
        ServerLinkSheetHost,
        {
          providers: [
            provideZonelessChangeDetection(),
            provideHttpClient(),
            { provide: HttpBackend, useValue: backend },
            provideClientHydration(withHttpTransferCacheOptions({ includePostRequests: true })),
            { provide: AuthService, useValue: { isLoggedIn: () => false, login: vi.fn() } },
            { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
          ],
        },
        context,
      ),
    {
      document: "<app-server-link-sheet-host></app-server-link-sheet-host>",
      platformProviders: [{ provide: ɵENABLE_DOM_EMULATION, useValue: false }],
    },
  );
}

describe("LinkSheetComponent (server render)", () => {
  beforeEach(() => {
    document.body.innerHTML = "<app-server-link-sheet-host></app-server-link-sheet-host>";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the closed sheet without its form and without querying the API", async () => {
    const requests: string[] = [];

    const html = await serverHtml(requests);

    expect(html).toContain("app-link-sheet");
    expect(html).not.toContain("app-link-form");
    expect(requests).toEqual([]);
    expect(html).not.toContain("InsidenReferenceData");
  });
});
