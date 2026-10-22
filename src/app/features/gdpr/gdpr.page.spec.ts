import { CUSTOM_ELEMENTS_SCHEMA, PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { PublicGdprDocument } from "./data/gdpr.model";
import { GdprPage } from "./gdpr.page";

// The unit-test builder shares one module cache across spec files (`isolate: false`), so reset it on
// both sides of this file (a later real `AuthService` would otherwise be built on the stubbed
// `firebase/app`); see "Unit-test isolation" in docs/COMPONENTS.md.
vi.hoisted(() => vi.resetModules());

// Firestore/Firebase are stubbed so the page's subscription can be driven per test.
// `vi.mock` factories are hoisted above imports, so shared handles come from `vi.hoisted`.
const firestore = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: () => ({}),
  doc: (...path: unknown[]) => ({ path }),
  onSnapshot: firestore.onSnapshot,
}));

afterAll(() => vi.resetModules());

type SnapshotNext = (snap: { data: () => unknown }) => void;
type SnapshotError = () => void;

/** The most recent `onSnapshot` registration made by the page. */
function latestCallbacks(): { next: SnapshotNext; error: SnapshotError } {
  const call = firestore.onSnapshot.mock.calls.at(-1);
  if (!call) throw new Error("onSnapshot was not called");
  return { next: call[1] as SnapshotNext, error: call[2] as SnapshotError };
}

const DOC: PublicGdprDocument = {
  definition: "GDPR is <strong>the</strong> EU data law.",
  intro: "Where we stand.",
  details: [
    {
      title: "Lawfulness",
      children: [
        { title: "Consent", adhered: true, details: "We ask first.", notes: "Reviewed in 2026." },
        { title: "Erasure", adhered: false, details: "Not yet automated." },
      ],
    },
  ],
};

describe("GdprPage", () => {
  let fixture: ComponentFixture<GdprPage>;
  let root: HTMLElement;

  function detect(): void {
    fixture.detectChanges();
  }

  function pushSnapshot(data: PublicGdprDocument | undefined): void {
    latestCallbacks().next({ data: () => data });
    detect();
  }

  function buttonWithText(text: string): HTMLButtonElement {
    const match = [...root.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === text,
    );
    if (!match) throw new Error(`button "${text}" not rendered`);
    return match;
  }

  async function createPage(platform: "browser" | "server" = "browser"): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [GdprPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
      ],
    })
      // Shell children pull in live services; the page's own markup is what's under test.
      .overrideComponent(GdprPage, {
        remove: { imports: [AppNavComponent, AppFooterComponent] },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(GdprPage);
    root = fixture.nativeElement as HTMLElement;
    detect();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    firestore.onSnapshot.mockImplementation(() => firestore.unsubscribe);
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it("shows skeleton blocks until the first snapshot lands", async () => {
    await createPage();

    expect(root.querySelectorAll("[hlmSkeleton]")).toHaveLength(2);
    expect(root.querySelector("details")).toBeNull();

    pushSnapshot(DOC);

    expect(root.querySelector("[hlmSkeleton]")).toBeNull();
  });

  it("renders the definition, intro, each group and every item with its adherence badge", async () => {
    await createPage();
    pushSnapshot(DOC);

    expect(root.querySelector("h1")?.textContent?.trim()).toBe("GDPR");
    expect(root.querySelector("p strong")?.textContent).toBe("the");
    expect(root.textContent).toContain("Where we stand.");
    expect(root.querySelector("h2")?.textContent?.trim()).toBe("Lawfulness");

    const items = [...root.querySelectorAll("details")];
    expect(items.map((item) => item.querySelector("summary span")?.textContent?.trim())).toEqual([
      "Consent",
      "Erasure",
    ]);
    expect(items.map((item) => item.querySelector("[hlmBadge]")?.textContent?.trim())).toEqual([
      "Adhered",
      "Not adhered",
    ]);
    // A note is shown after a rule, and only when the item has one.
    expect(items[0].textContent).toContain("Reviewed in 2026.");
    expect(items[1].querySelector("hr")).toBeNull();
    expect(root.textContent).not.toContain("No GDPR information has been published yet.");
  });

  it("strips a script out of the admin-authored HTML before it reaches the DOM", async () => {
    await createPage();
    pushSnapshot({ ...DOC, intro: 'Safe<script data-testid="evil">alert(1)</script> text' });

    expect(root.querySelector('[data-testid="evil"]')).toBeNull();
    expect(root.textContent).toContain("Safe");
  });

  it("shows the empty message when the document is missing", async () => {
    await createPage();
    pushSnapshot(undefined);

    expect(root.textContent).toContain("No GDPR information has been published yet.");
    expect(root.querySelector("details")).toBeNull();
    expect(root.querySelector("[role='alert']")).toBeNull();
  });

  it("shows the empty message when the document has no groups", async () => {
    await createPage();
    pushSnapshot({ definition: "", intro: "", details: [] });

    expect(root.textContent).toContain("No GDPR information has been published yet.");
  });

  it("shows an error with Retry on a snapshot error, and Retry re-subscribes", async () => {
    await createPage();
    latestCallbacks().error();
    detect();

    expect(root.textContent).toContain("Couldn't load the GDPR information");
    expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);

    buttonWithText("Retry").click();
    detect();

    // The old listener is released before the new one starts, and the skeleton is back meanwhile.
    expect(firestore.unsubscribe).toHaveBeenCalledTimes(1);
    expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);
    expect(root.textContent).not.toContain("Couldn't load the GDPR information");
    expect(root.querySelector("[hlmSkeleton]")).not.toBeNull();

    pushSnapshot(DOC);

    expect(root.querySelectorAll("details")).toHaveLength(2);
  });

  it("stops listening when the page is destroyed", async () => {
    await createPage();

    fixture.destroy();

    expect(firestore.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not touch Firestore on the server, so the HTML carries the loading state", async () => {
    await createPage("server");

    expect(firestore.onSnapshot).not.toHaveBeenCalled();
    expect(root.querySelector("[hlmSkeleton]")).not.toBeNull();
  });
});
