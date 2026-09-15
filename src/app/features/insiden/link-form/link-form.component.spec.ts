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
      data: { lines: [], stations: [], calendarIncidentCategories: [] },
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
});
