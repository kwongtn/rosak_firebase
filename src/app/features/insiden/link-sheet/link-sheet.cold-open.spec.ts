import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { LinkSheetService } from "../data/link-sheet.service";
import { LinkSheetComponent } from "./link-sheet.component";

/**
 * Its own file on purpose: the hazard exists only while the deferred form's chunk has not been
 * loaded yet, and a spec file starts with a fresh module graph. Any earlier spec in the same file
 * that opened the sheet would leave the chunk warm and this one passing for the wrong reason.
 */
describe("LinkSheetComponent cold open", () => {
  it("never lets a user event reach the lazily created form's date input before it is bound", async () => {
    // 🔴 On a cold open the chunk resolves outside change detection. A form created bare from that
    // promise has its DOM in the live sheet a tick before its fields are bound; the date input's
    // validity listener then reads the not-yet-set FormField and throws NG0950 from a DOM event.
    // The observer fires in the microtask right after each insertion, ahead of the next tick.
    await TestBed.configureTestingModule({
      imports: [LinkSheetComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => true, login: vi.fn(), idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();
    const httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LinkSheetComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", onError);
    let probed = 0;
    const observer = new MutationObserver(() => {
      for (const input of root.querySelectorAll('input[type="datetime-local"]')) {
        probed++;
        const event = new Event("animationstart");
        Object.defineProperty(event, "animationName", { value: "ng-valid" });
        input.dispatchEvent(event);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    try {
      TestBed.inject(LinkSheetService).open();
      const reads = await vi.waitFor(
        () => {
          const found = httpMock.match(
            (request) =>
              request.method === "POST" &&
              (request.body?.query ?? "").includes("InsidenReferenceData"),
          );
          if (found.length === 0) throw new Error("the deferred form has not started its read yet");
          return found;
        },
        { timeout: 15000 },
      );
      for (const read of reads) {
        read.flush({
          data: { lines: [], stations: [], calendarIncidentCategories: [] },
        });
      }
      await fixture.whenStable();
    } finally {
      observer.disconnect();
      window.removeEventListener("error", onError);
    }

    expect(probed).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    httpMock.verify();
  }, 30000);
});
