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
  return { url: "https://x.com/prasarana/status/1", title: "Service update" };
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
    expect(component.model()).toEqual({ url: "", title: "" });
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
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.isEditing()).toBe(true);
    const component = asTestable(fixture);
    expect(component.model()).toEqual({ url: link.url, title: link.title });
  });

  it("sends the UPDATE mutation with the link id for edits", async () => {
    const link = makeLink();
    sheet.openEdit(link);
    fixture.detectChanges();
    await fixture.whenStable();
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
    expect(component.model()).toEqual({ url: "", title: "" });
    expect(fixture.componentInstance.isEditing()).toBe(false);
  });

  function makeLink() {
    return {
      id: "link-1",
      url: "https://x.com/prasarana/status/2",
      title: "Delays on KTM",
      created: "2026-08-01T08:00:00Z",
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
