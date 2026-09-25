import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NewVersionService } from "../../core/version/new-version.service";
import { AppFooterComponent } from "./app-footer.component";

describe("AppFooterComponent", () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppFooterComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // The real service polls /version.json on construction and injects ToastService;
        // the footer only reads `hasNewVersion` from it.
        { provide: NewVersionService, useValue: { hasNewVersion: signal(false) } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Renders the footer and settles its backend-version httpResource so no request outlives
   * the test. */
  function render(): ComponentFixture<AppFooterComponent> {
    const fixture = TestBed.createComponent(AppFooterComponent);
    fixture.detectChanges();
    TestBed.tick();
    httpMock
      .match((request) => request.url.endsWith("version/"))
      .forEach((request) => request.flush({ hash: "unknown", datetime: null }));
    fixture.detectChanges();
    return fixture;
  }

  function anchorByText(root: HTMLElement, text: string): HTMLAnchorElement | undefined {
    return [...root.querySelectorAll("a")].find((anchor) => anchor.textContent?.trim() === text);
  }

  it("renders a Methodology link to /methodology in the footer's legal paragraph", () => {
    const fixture = render();
    const root = fixture.nativeElement as HTMLElement;

    const methodology = anchorByText(root, "Methodology");
    expect(methodology).toBeDefined();
    expect(methodology?.getAttribute("href")).toBe("/methodology");

    // Same paragraph as GDPR — the legal/credits line, not the build-info block.
    const gdpr = anchorByText(root, "GDPR");
    expect(gdpr).toBeDefined();
    expect(methodology?.closest("p")).toBe(gdpr?.closest("p"));
  });

  it("keeps the existing GDPR link intact", () => {
    const fixture = render();
    const root = fixture.nativeElement as HTMLElement;

    const gdpr = anchorByText(root, "GDPR");
    expect(gdpr).toBeDefined();
    expect(gdpr?.getAttribute("href")).toBe("/gdpr");
  });
});
