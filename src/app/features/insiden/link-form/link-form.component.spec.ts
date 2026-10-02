import { type WritableSignal } from "@angular/core";
import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { SUBMIT_SOCIAL_MEDIA_LINK_MUTATION } from "../data/insiden.queries";
import { LinkSheetService } from "../data/link-sheet.service";
import { UPDATE_SOCIAL_MEDIA_LINK_MUTATION } from "../data/social-links.queries";
import { LinkFormComponent } from "./link-form.component";

interface LinkFormModel {
  url: string;
  title: string;
  /** datetime-local value; "" when unset. Mirrors the component's own (private) model. */
  occurredAt: string;
}

interface ComponentUnderTest {
  model: WritableSignal<LinkFormModel>;
  isSubmitting: WritableSignal<boolean>;
  submit(): Promise<void>;
  clear(): void;
}

function asTestable(fixture: ComponentFixture<LinkFormComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

function filledModel(): LinkFormModel {
  return { url: "https://x.com/prasarana/status/1", title: "Service update", occurredAt: "" };
}

/**
 * Waits for the reference query to land AND lets the component's effects run, so edit
 * hydration has actually happened before a test reads `model()`.
 */
async function settle(fixture: ComponentFixture<LinkFormComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
}

describe("LinkFormComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let toastMocks: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let authMocks: { isLoggedIn: ReturnType<typeof vi.fn>; isAdmin: ReturnType<typeof vi.fn> };
  let sheet: InstanceType<typeof LinkSheetService>;
  let fixture: ComponentFixture<LinkFormComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ submitSocialMediaLink: { ok: true } });
    toastMocks = { success: vi.fn(), error: vi.fn() };
    authMocks = { isLoggedIn: vi.fn(() => true), isAdmin: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LinkFormComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { ...authMocks, idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: toastMocks },
      ],
    }).compileComponents();

    sheet = TestBed.inject(LinkSheetService);
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LinkFormComponent);
    fixture.detectChanges();
    const referenceRequest = httpMock.expectOne((r) => r.method === "POST");
    referenceRequest.flush({
      data: {
        lines: [],
        stations: [],
        calendarIncidentCategories: [{ id: "C1", name: "Just Reporting" }],
      },
    });
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("shows the read-only incident context line when opened from a card", () => {
    sheet.open({ incidentId: "7", incidentTitle: "KL Sentral flood" });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Linking to incident:");
    expect(fixture.nativeElement.textContent).toContain("KL Sentral flood");
  });

  it("falls back to the incident id when the context carries no title", () => {
    sheet.open({ incidentId: "7", incidentTitle: null });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Linking to incident:");
    expect(fixture.nativeElement.textContent).toContain("7");
  });

  it("injects incidentId into the SUBMIT vars when a context is set", async () => {
    sheet.open({ incidentId: "7", incidentTitle: "KL Sentral flood" });
    const component = asTestable(fixture);
    component.model.set(filledModel());

    await component.submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(SUBMIT_SOCIAL_MEDIA_LINK_MUTATION);
    expect(vars.input.incidentId).toBe("7");
    expect(toastMocks.success).toHaveBeenCalledTimes(1);
    expect(sheet.isOpen()).toBe(false);
    expect(sheet.context()).toBeNull();
  });

  it("omits incidentId entirely for contextless just-dumping submissions", async () => {
    sheet.open();
    const component = asTestable(fixture);
    component.model.set(filledModel());

    await component.submit();

    const [, vars] = requestMock.mock.calls[0];
    expect(vars.input).not.toHaveProperty("incidentId");
  });

  it("pre-fills the mandatory 'Just Reporting' category on a new submission", async () => {
    sheet.open();
    await fixture.whenStable();
    const component = asTestable(fixture);
    component.model.set(filledModel());

    await component.submit();

    const [, vars] = requestMock.mock.calls[0];
    expect(vars.input.categoryIds).toEqual(["C1"]);
  });

  it("resets the context on clear so a stale incident cannot leak into the next submission", async () => {
    sheet.open({ incidentId: "7", incidentTitle: "KL Sentral flood" });
    const component = asTestable(fixture);
    component.model.set(filledModel());

    component.clear();

    expect(sheet.context()).toBeNull();
    expect(component.model()).toEqual({ url: "", title: "", occurredAt: "" });
    component.model.set(filledModel());
    await component.submit();
    const [, vars] = requestMock.mock.calls[0];
    expect(vars.input).not.toHaveProperty("incidentId");
  });

  it("clears the incident context when the sheet closes", async () => {
    sheet.open({ incidentId: "7", incidentTitle: "KL Sentral flood" });
    fixture.detectChanges();
    await fixture.whenStable();

    sheet.close();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(sheet.context()).toBeNull();
  });

  it("hydrates the form and flags edit mode when opened for an existing link", async () => {
    const link = makeLink();
    sheet.openEdit(link);
    await settle(fixture);

    expect(fixture.componentInstance.isEditing()).toBe(true);
    const component = asTestable(fixture);
    expect(component.model()).toEqual({
      url: link.url,
      title: link.title,
      occurredAt: "2026-08-01T08:30",
    });
  });

  it("pre-fills the url field from a create-open prefill", async () => {
    sheet.open(undefined, { url: "https://example.com/prefilled" });
    fixture.detectChanges();
    await fixture.whenStable();

    const component = asTestable(fixture);
    expect(component.model().url).toBe("https://example.com/prefilled");
  });

  it("ignores the prefill when the sheet opens in edit mode", async () => {
    const link = makeLink();
    sheet.open(undefined, { url: "https://example.com/prefilled" });
    sheet.openEdit(link);
    await settle(fixture);

    const component = asTestable(fixture);
    expect(component.model()).toEqual({
      url: link.url,
      title: link.title,
      occurredAt: "2026-08-01T08:30",
    });
  });

  it("consumes the prefill once: reopening after a close without a new prefill is blank", async () => {
    sheet.open(undefined, { url: "https://example.com/prefilled" });
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);
    expect(component.model().url).toBe("https://example.com/prefilled");

    sheet.close();
    fixture.detectChanges();
    await fixture.whenStable();

    sheet.open();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.model()).toEqual({ url: "", title: "", occurredAt: "" });
  });

  it("re-applies a new prefill on a second create-open after a close", async () => {
    sheet.open(undefined, { url: "https://example.com/first" });
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);
    expect(component.model().url).toBe("https://example.com/first");

    sheet.close();
    fixture.detectChanges();
    await fixture.whenStable();

    sheet.open(undefined, { url: "https://example.com/second" });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.model().url).toBe("https://example.com/second");
  });

  it("sends the UPDATE mutation with the link id for edits", async () => {
    const link = makeLink();
    sheet.openEdit(link);
    await settle(fixture);
    const component = asTestable(fixture);

    await component.submit();

    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(UPDATE_SOCIAL_MEDIA_LINK_MUTATION);
    expect(vars.socialMediaLinkId).toBe(link.id);
    expect(vars.input).toEqual({
      url: link.url,
      title: link.title,
      lineIds: ["4"],
      vehicleIds: ["5"],
      stationIds: ["6"],
      categoryIds: ["9"],
      // Re-sent because `SocialMediaLinkInput` is replace-not-patch — dropping it would leave
      // the backend to decide, and a coerced `undefined` is indistinguishable from omitted.
      occurredAt: "2026-08-01T08:30:00",
    });
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(sheet.isOpen()).toBe(false);
  });

  it("closes the edit with the admin toast when an admin saves", async () => {
    authMocks.isAdmin.mockReturnValue(true);
    sheet.openEdit(makeLink());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);

    await component.submit();

    expect(toastMocks.success).toHaveBeenCalledWith("Link updated", "Your changes are live.");
    expect(sheet.editTarget()).toBeNull();
  });

  it("closes the edit with the review toast when a submitter saves", async () => {
    sheet.openEdit(makeLink());
    fixture.detectChanges();
    await fixture.whenStable();
    const component = asTestable(fixture);

    await component.submit();

    expect(toastMocks.success).toHaveBeenCalledWith(
      "Link updated",
      "An admin will review the changes.",
    );
    expect(sheet.editTarget()).toBeNull();
  });

  it("resets the edit target on clear so a stale link cannot be re-saved", () => {
    sheet.openEdit(makeLink());
    const component = asTestable(fixture);

    component.clear();

    expect(sheet.editTarget()).toBeNull();
    expect(component.model()).toEqual({ url: "", title: "", occurredAt: "" });
    expect(fixture.componentInstance.isEditing()).toBe(false);
  });

  // ---------------------------------------------------------------------------------------
  // "When did this happen?" (`occurredAt`) — the optional event instant, which is NOT `created`.
  //
  // Every case below asserts on the VARIABLES object handed to `GraphQLClient.request`, because
  // the whole feature is a payload question: three different inputs (empty / filled / cleared)
  // have to become three different wire spellings, and "the submit didn't throw" cannot tell
  // them apart. The create/update asymmetry below is the trap worth pinning.
  // ---------------------------------------------------------------------------------------

  describe("occurredAt on create", () => {
    it("OMITS the key entirely when the field is left blank, rather than sending null", async () => {
      // Both spellings mean "stamp the submission instant" server-side on create, but omitting
      // is the honest one: `null` on the wire reads as an intent to clear a value that was
      // never set, and would be indistinguishable from the update path's deliberate reset.
      sheet.open();
      await settle(fixture);
      const component = asTestable(fixture);
      component.model.set(filledModel());

      await component.submit();

      const [mutation, vars] = requestMock.mock.calls[0];
      expect(mutation).toBe(SUBMIT_SOCIAL_MEDIA_LINK_MUTATION);
      expect(vars.input).not.toHaveProperty("occurredAt");
    });

    it("sends the wall time the rider typed, with no offset and no UTC conversion", async () => {
      // The 8-hour-bug guard: the backend column is naive local (`USE_TZ = False`), so a `Z`
      // or a `+08:00` here would shift every stored event instant.
      sheet.open();
      await settle(fixture);
      const component = asTestable(fixture);
      component.model.set({ ...filledModel(), occurredAt: "2026-08-01T08:30" });

      await component.submit();

      const [, vars] = requestMock.mock.calls[0];
      expect(vars.input).toHaveProperty("occurredAt", "2026-08-01T08:30:00");
      expect(vars.input.occurredAt).not.toContain("Z");
      expect(vars.input.occurredAt).not.toContain("+");
    });

    it("never reads the report instant (`created`) into the field — they are different things", async () => {
      // Guards a plausible-looking "helpful" default: pre-filling the box with now() would make
      // the rider's backdated post land at report time and would break SSR (two different
      // `value=` attributes for one request). Blank is the only correct default.
      sheet.open();
      await settle(fixture);

      expect(asTestable(fixture).model().occurredAt).toBe("");
    });
  });

  describe("occurredAt on edit", () => {
    it("hydrates the field from the link's occurredAt, never from its created", async () => {
      // `makeLink()` has created 08:00:00Z and occurredAt 08:30:00 — a mix-up would show 08:00.
      sheet.openEdit(makeLink());
      await settle(fixture);

      const component = asTestable(fixture);
      expect(component.model().occurredAt).toBe("2026-08-01T08:30");
      expect(component.model().occurredAt).not.toContain("Z");
    });

    it("hydrates an empty (unset) field when the host query does not select occurredAt", async () => {
      // Structural-optionality, same rule as the tag lists: an absent field renders `""` and
      // stays usable rather than showing Invalid Date.
      sheet.openEdit(makeLink({ occurredAt: undefined }));
      await settle(fixture);

      expect(asTestable(fixture).model().occurredAt).toBe("");
    });

    it("round-trips the event time untouched when the rider saves without editing it", async () => {
      sheet.openEdit(makeLink());
      await settle(fixture);
      const component = asTestable(fixture);

      await component.submit();

      const [, vars] = requestMock.mock.calls[0];
      expect(vars.input.occurredAt).toBe("2026-08-01T08:30:00");
      // The sub-minute precision the control cannot hold must not leak in either.
      expect(vars.input.occurredAt).not.toContain(".");
    });

    it("sends an explicit null when the rider CLEARS the field — the deliberate reset to report time", async () => {
      // ⚠️ THE tri-state case, and the one most likely to be "fixed" into a bug: `null` on
      // update means "reset the event time to link.created", which is exactly what a rider
      // clearing the box is saying ("it actually happened when I reported it"). Coercing this
      // to `undefined`/omitted would make "cleared" unreachable and silently un-clearable.
      sheet.openEdit(makeLink());
      await settle(fixture);
      const component = asTestable(fixture);
      component.model.update((model) => ({ ...model, occurredAt: "" }));

      await component.submit();

      const [, vars] = requestMock.mock.calls[0];
      // Presence is asserted separately on purpose: with `strictNullChecks` OFF an omitted key
      // and an explicit `null` both read as `undefined`/`null`-ish through loose access, so the
      // `toHaveProperty` check is what actually pins "the key IS on the wire".
      expect(vars.input).toHaveProperty("occurredAt");
      expect(vars.input.occurredAt).toBeNull();
    });

    it("sends a corrected event time when the rider moves the clock", async () => {
      sheet.openEdit(makeLink());
      await settle(fixture);
      const component = asTestable(fixture);
      component.model.update((model) => ({ ...model, occurredAt: "2026-07-31T21:15" }));

      await component.submit();

      const [, vars] = requestMock.mock.calls[0];
      expect(vars.input.occurredAt).toBe("2026-07-31T21:15:00");
    });
  });

  it("resets the datetime field on clear so an edited event time cannot leak into a new submission", async () => {
    // Edit → clear (the sheet's footer "Clear form") → create must start from an EMPTY box, not
    // from the row that was being edited.
    sheet.openEdit(makeLink());
    await settle(fixture);
    const component = asTestable(fixture);
    expect(component.model().occurredAt).toBe("2026-08-01T08:30");

    component.clear();

    expect(component.model().occurredAt).toBe("");

    // Re-open in create mode and re-fill the (now blank) required URL — the datetime must stay
    // empty, which is what keeps the edited row's event time off the new submission's payload.
    sheet.open();
    await settle(fixture);
    component.model.set(filledModel());
    await component.submit();
    const [, vars] = requestMock.mock.calls[0];
    expect(vars.input).not.toHaveProperty("occurredAt");
  });

  function makeLink(overrides: Partial<ReturnType<typeof makeLinkBase>> = {}) {
    return { ...makeLinkBase(), ...overrides };
  }

  function makeLinkBase() {
    return {
      id: "link-1",
      url: "https://x.com/prasarana/status/2",
      title: "Delays on KTM",
      created: "2026-08-01T08:00:00Z",
      // Deliberately NOT the same clock as `created`: the event happened 30 minutes after the
      // report, which is what makes "hydrates from occurredAt, not created" observable at all.
      // Naive local, no offset — the backend's actual wire shape (USE_TZ = False).
      occurredAt: "2026-08-01T08:30:00",
      completed: true,
      status: "LIVE" as const,
      voteScore: 0,
      userVote: 0,
      voteBreakdown: { upvotes: 0, downvotes: 0 },
      lines: [{ id: "4", code: "KTM1", displayName: "KTM Komuter Line 1" }],
      vehicles: [{ id: "5", identificationNo: "TR-102" }],
      stations: [{ id: "6", displayName: "KL Sentral" }],
      user: { shortId: "abc12345", nickname: "" },
      categories: [{ id: "9", name: "Signal" }],
    };
  }
});
