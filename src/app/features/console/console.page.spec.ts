import {
  Component,
  provideZonelessChangeDetection,
  type Signal,
  type WritableSignal,
} from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ReCaptchaV3Service } from "ng-recaptcha-2";
import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { ToastService } from "../../ui/toast/toast.service";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { ConsolePage } from "./console.page";
import { type ConsoleEvent } from "./data/console.queries";

/* The real app-nav/footer pull in browser-only services (ThemeService needs
 * matchMedia); the shell chrome is irrelevant here, so swap in stand-ins. */
@Component({ selector: "app-nav", template: "" })
class StubNav {}

@Component({ selector: "app-footer", template: "" })
class StubFooter {}

function makeEvent(id: string, overrides: Partial<ConsoleEvent> = {}): ConsoleEvent {
  return {
    id,
    spottingDate: "2026-10-01",
    notes: `notes for ${id}`,
    created: "2026-10-01T09:00:00",
    status: "IN_SERVICE",
    type: "JUST_SPOTTING",
    runNumber: null,
    mediaCount: 0,
    isMine: false,
    wheelStatus: null,
    vehicle: {
      id: `veh-${id}`,
      status: "IN_SERVICE",
      identificationNo: "V-123",
      vehicleType: { internalName: "Emu" },
      lines: [{ id: "l1", code: "KJL" }],
    },
    reporter: { shortId: "abcd1234", nickname: "Zul" },
    ...overrides,
  };
}

const EVENTS = [makeEvent("e1"), makeEvent("e2"), makeEvent("e3")];

/** The page's template-facing surface is `protected`; tests reach it through this
 * typed projection instead of leaking `any` into the suite. */
interface ConsolePageUnderTest {
  events: WritableSignal<ConsoleEvent[]>;
  checkedIds: WritableSignal<Set<string>>;
  checkedCount: Signal<number>;
  isLoading: WritableSignal<boolean>;
  search(): void;
  loadMore(): void;
  markAsRead(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<ConsolePage>): ConsolePageUnderTest {
  return fixture.componentInstance as unknown as ConsolePageUnderTest;
}

describe("ConsolePage selection UX", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let recaptchaMock: ReturnType<typeof vi.fn>;
  let toastMocks: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<ConsolePage>;

  beforeEach(async () => {
    requestMock = vi.fn((query: string) => {
      if (query.includes("mutation MarkAsRead")) {
        return Promise.resolve({ markAsRead: { ok: true } });
      }
      return Promise.resolve({ eventsCount: EVENTS.length, events: EVENTS });
    });
    recaptchaMock = vi.fn(() => of("recaptcha-token"));
    toastMocks = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ConsolePage],
      providers: [
        provideZonelessChangeDetection(),
        // The row's vehicle routerLink is real, so the suite has to give it a
        // matching route — an unmatched one rejects the navigation and Vitest
        // reports it as an unhandled rejection, unrelated to the click test.
        provideRouter([{ path: "spotting/:lineId/vehicle/:vehicleId", children: [] }]),
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: AuthService, useValue: { idToken: async () => "token" } },
        { provide: ToastService, useValue: toastMocks },
        { provide: ReCaptchaV3Service, useValue: { execute: recaptchaMock } },
      ],
    }).compileComponents();

    TestBed.overrideComponent(ConsolePage, {
      remove: { imports: [AppNavComponent, AppFooterComponent] },
      add: { imports: [StubNav, StubFooter] },
    });
    fixture = TestBed.createComponent(ConsolePage);
    fixture.detectChanges();
    await settled();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Zoneless whenStable() does not track the constructor's fire-and-forget load —
   * wait for the request AND the loading flag to drop, otherwise a follow-up
   * load() trips its own re-entrancy guard. */
  async function settled(): Promise<void> {
    await fixture.whenStable();
    await vi.waitFor(() => expect(asTestable(fixture).isLoading()).toBe(false));
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(host().querySelectorAll("tbody tr"));
  }

  /** Located by the row's event-id link text, not by index, so a row removed by a
   * successful mark-as-read cannot make a later assertion point at the wrong row. */
  function rowFor(id: string): HTMLTableRowElement {
    const row = rows().find((r) => r.querySelector("td a")?.textContent?.trim() === id);
    if (!row) {
      throw new Error(`no rendered row for event ${id}`);
    }
    return row;
  }

  function cell(row: HTMLTableRowElement, index: number): HTMLElement {
    const el = row.querySelectorAll("td")[index];
    if (!el) {
      throw new Error(`row has no cell ${index}`);
    }
    return el as HTMLElement;
  }

  /** The rendered control: the <hlm-checkbox> host, so clicks land exactly where a
   * user's would (the inner <button role="checkbox"> is what actually gets hit). */
  function checkbox(id: string): HTMLElement {
    const box = rowFor(id).querySelector<HTMLElement>('[data-testid="row-checkbox"]');
    if (!box) {
      throw new Error(`event ${id} has no row checkbox`);
    }
    return box;
  }

  /** The control that actually takes focus: the `<button role="checkbox">` the Spartan
   *  primitive renders inside the `<hlm-checkbox>` host. An accessible name only counts
   *  on THIS element — the host is a `display: contents` wrapper with no role. */
  function innerCheckbox(id: string): HTMLElement {
    const button = checkbox(id).querySelector<HTMLElement>('button[role="checkbox"]');
    if (!button) {
      throw new Error(`event ${id} has no inner checkbox control`);
    }
    return button;
  }

  function byTestId(id: string): HTMLElement | null {
    return host().querySelector(`[data-testid="${id}"]`);
  }

  function plainClick(el: HTMLElement): void {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  function shiftClick(el: HTMLElement): void {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
  }

  /** jsdom tries to navigate a clicked <a>; swallow the default action so the suite
   * doesn't log "navigation not implemented". Bubbling — and therefore the
   * stopPropagation under test — is untouched. */
  function clickAnchor(anchor: HTMLElement): void {
    anchor.addEventListener("click", (e) => e.preventDefault());
    plainClick(anchor);
  }

  function checkedText(): string | null {
    return byTestId("mark-as-read")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  }

  it("shows a checkbox for every row with no select-mode toggle", () => {
    expect(host().textContent).not.toContain("Select rows to mark as read");
    expect(host().querySelectorAll('[data-testid="row-checkbox"]')).toHaveLength(EVENTS.length);
  });

  it("renders the checkbox column ungated (one checkbox cell ahead of the 8 data cells)", () => {
    expect(cell(rowFor("e1"), 0).querySelector('[data-testid="row-checkbox"]')).not.toBeNull();
    expect(rowFor("e1").querySelectorAll("td")).toHaveLength(9);
    expect(host().querySelectorAll("thead th")).toHaveLength(9);
  });

  // The row tick is a bare 16px box with no visible label, so the name is the ONLY thing
  // that tells a screen reader which event it toggles. It has to reach the inner button:
  // `[attr.aria-label]` on `<hlm-checkbox>` compiled to a host attribute on a role-less,
  // `display: contents` wrapper and named nothing.
  it("gives the focusable checkbox control an accessible name, on the control itself", () => {
    for (const event of EVENTS) {
      expect(innerCheckbox(event.id).getAttribute("aria-label")).toBe(`Select event ${event.id}`);
    }
  });

  it("hides the bulk-action button until at least one row is checked", () => {
    expect(checkedText()).toBeNull();
    plainClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();
    expect(checkedText()).toBe("Mark 1 as read");
  });

  it("toggles the row when a plain data cell is clicked, and toggles it back", () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e1"]));
    expect(rowFor("e1").classList.contains("bg-muted")).toBe(true);
    expect(rowFor("e2").classList.contains("bg-muted")).toBe(false);

    plainClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set());
    expect(rowFor("e1").classList.contains("bg-muted")).toBe(false);
  });

  it("toggles the row when its checkbox is clicked, and toggles it back", () => {
    const component = asTestable(fixture);
    plainClick(checkbox("e2"));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e2"]));
    plainClick(checkbox("e2"));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set());
  });

  it("does not double-toggle when the checkbox is clicked (it stops propagation)", () => {
    const component = asTestable(fixture);
    plainClick(checkbox("e2"));
    fixture.detectChanges();
    expect(component.checkedCount()).toBe(1);
  });

  it("shift+click checks the inclusive range from the anchor", () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();
    shiftClick(cell(rowFor("e3"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e1", "e2", "e3"]));
    expect(checkedText()).toBe("Mark 3 as read");
  });

  it("shift+click works upwards too", () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e3"), 4));
    fixture.detectChanges();
    shiftClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e1", "e2", "e3"]));
  });

  it("shift+click on the checkbox behaves exactly like shift+click on the row", () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();
    shiftClick(checkbox("e3"));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e1", "e2", "e3"]));
  });

  it("shift+click on a checked row un-checks the whole range", () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e1"), 4));
    shiftClick(cell(rowFor("e3"), 4));
    fixture.detectChanges();
    expect(component.checkedCount()).toBe(3);

    shiftClick(cell(rowFor("e3"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set());
    expect(checkedText()).toBeNull();
  });

  it("leaves selection outside the range alone", () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e3"), 4));
    fixture.detectChanges();
    plainClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();
    shiftClick(cell(rowFor("e2"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e1", "e2", "e3"]));
  });

  it("a shift+click with no anchor only affects the clicked row", () => {
    const component = asTestable(fixture);
    shiftClick(cell(rowFor("e2"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e2"]));
  });

  it("emptying the selection drops the anchor, so the next shift+click is single-row", () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e1"), 4));
    plainClick(cell(rowFor("e2"), 4));
    plainClick(cell(rowFor("e2"), 4));
    plainClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set());

    shiftClick(cell(rowFor("e3"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e3"]));
  });

  it("a reloaded list drops the anchor, so a later shift+click is single-row", async () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e1"), 4));
    fixture.detectChanges();

    asTestable(fixture).loadMore();
    await settled();

    shiftClick(cell(rowFor("e3"), 4));
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set(["e1", "e3"]));
  });

  it("searching clears the selection and hides the bulk-action button", () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e1"), 4));
    plainClick(cell(rowFor("e2"), 4));
    fixture.detectChanges();
    expect(checkedText()).toBe("Mark 2 as read");

    const search = Array.from(host().querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Search",
    );
    search?.click();
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set());
    expect(checkedText()).toBeNull();
  });

  it("a click on the event-id admin link does not toggle the row", () => {
    const component = asTestable(fixture);
    const link = rowFor("e1").querySelector<HTMLElement>("td a");
    clickAnchor(link as HTMLElement);
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set());
  });

  it("a click on the reporter admin link does not toggle the row", () => {
    const component = asTestable(fixture);
    const links = Array.from(rowFor("e1").querySelectorAll<HTMLElement>("td a"));
    clickAnchor(links[1]);
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set());
  });

  it("a click on the vehicle routerLink does not toggle the row", () => {
    const component = asTestable(fixture);
    const vehicleLink = Array.from(rowFor("e1").querySelectorAll<HTMLElement>("td a")).find((a) =>
      a.textContent?.includes("V-123"),
    );
    clickAnchor(vehicleLink as HTMLElement);
    fixture.detectChanges();
    expect(component.checkedIds()).toEqual(new Set());
  });

  it("markAsRead still sends a reCAPTCHA token and the selected ids, then clears them", async () => {
    const component = asTestable(fixture);
    plainClick(cell(rowFor("e1"), 4));
    plainClick(cell(rowFor("e3"), 4));
    fixture.detectChanges();

    byTestId("mark-as-read")?.click();
    await vi.waitFor(() => {
      const call = requestMock.mock.calls.find((c) =>
        (c[0] as string).includes("mutation MarkAsRead"),
      );
      expect(call).toBeDefined();
    });

    const call = requestMock.mock.calls.find((c) =>
      (c[0] as string).includes("mutation MarkAsRead"),
    );
    expect(call?.[1]).toEqual({ input: { eventIds: ["e1", "e3"] } });
    expect(call?.[2]).toEqual({
      "g-recaptcha-response": "recaptcha-token",
      "firebase-auth-key": "token",
    });
    expect(recaptchaMock).toHaveBeenCalledWith("markAsRead");

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    expect(component.checkedIds()).toEqual(new Set());
    expect(toastMocks.success).toHaveBeenCalled();
  });
});
