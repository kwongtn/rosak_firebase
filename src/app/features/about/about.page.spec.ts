import {
  CUSTOM_ELEMENTS_SCHEMA,
  WritableSignal,
  provideZonelessChangeDetection,
  signal,
} from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { ToastService } from "../../ui/toast/toast.service";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { PublicAboutDocument } from "./data/about.model";
import { AboutPage } from "./about.page";

// Firestore/Firebase are stubbed so the page's constructor subscription can be driven per test.
// `vi.mock` factories are hoisted above imports, so shared handles come from `vi.hoisted`.
const firestore = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
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
  setDoc: firestore.setDoc,
}));

type SnapshotNext = (snap: { data: () => unknown }) => void;
type SnapshotError = () => void;

/** The most recent `onSnapshot` registration made by the page. */
function latestCallbacks(): { next: SnapshotNext; error: SnapshotError } {
  const call = firestore.onSnapshot.mock.calls.at(-1);
  if (!call) throw new Error("onSnapshot was not called");
  return { next: call[1] as SnapshotNext, error: call[2] as SnapshotError };
}

const FULL_DOC: PublicAboutDocument = {
  aboutProject: "We build transit tools.",
  projects: [
    {
      name: "Alpha Tracker",
      description: "Live bus map",
      startDate: "2024-01",
      display: true,
      status: "beta",
    },
    {
      name: "Beta Atlas",
      description: "Route atlas",
      startDate: "2023-05",
      display: true,
      status: "stable",
    },
    {
      name: "Hidden Thing",
      description: "Not public",
      startDate: "2022-01",
      display: false,
      status: "alpha",
    },
  ],
  personnel: [
    {
      name: "Ann Lee",
      avatar: "",
      title: "Engineer",
      description: "Builds things",
      display: true,
      retired: false,
      startDate: "2020-01",
      endDate: "",
      order: 1,
      socials: [],
    },
  ],
  techStacks: [
    {
      name: "Angular",
      description: "Frontend framework",
      iconUrl: "",
      url: "https://angular.dev",
    },
  ],
  communityProjects: [
    {
      name: "Community Map",
      description: "Shared map",
      iconUrl: "",
      url: "https://example.com/map",
    },
  ],
};

/** A legacy doc: rows with no `display` field at all, as hand-edited Firestore data can contain. */
const LEGACY_DOC = {
  aboutProject: "Legacy text",
  projects: [{ name: "Legacy Project", description: "old", startDate: "2021-01", status: "beta" }],
  personnel: [{ name: "Legacy Person", title: "Old", startDate: "2019-01", order: 1 }],
  techStacks: [],
  communityProjects: [],
} as unknown as PublicAboutDocument;

describe("AboutPage", () => {
  let fixture: ComponentFixture<AboutPage>;
  let root: HTMLElement;
  let auth: { isAdmin: WritableSignal<boolean> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  function detect(): void {
    fixture.detectChanges();
  }

  function pushSnapshot(data: PublicAboutDocument | undefined): void {
    latestCallbacks().next({ data: () => data });
    detect();
  }

  function buttonWithText(text: string): HTMLButtonElement {
    const match = [...root.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").replace(/\s+/g, " ").trim() === text,
    );
    if (!match) throw new Error(`button "${text}" not rendered`);
    return match;
  }

  function searchInput(): HTMLInputElement {
    const input = root.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) throw new Error("search input not rendered");
    return input;
  }

  function typeSearch(term: string): void {
    const input = searchInput();
    input.value = term;
    input.dispatchEvent(new Event("input"));
    detect();
  }

  function createPage(): void {
    fixture = TestBed.createComponent(AboutPage);
    root = fixture.nativeElement as HTMLElement;
    detect();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    firestore.onSnapshot.mockImplementation(() => firestore.unsubscribe);
    firestore.setDoc.mockResolvedValue(undefined);

    auth = { isAdmin: signal(false) };
    toast = { success: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AboutPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    })
      // Shell and ad children pull in live services; the page's own markup is what's under test.
      .overrideComponent(AboutPage, {
        remove: { imports: [AdSlotComponent, AppNavComponent, AppFooterComponent] },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it("renders one h1 and a heading, id and jump link for each visible section", () => {
    createPage();
    pushSnapshot(FULL_DOC);

    expect(root.querySelectorAll("h1")).toHaveLength(1);

    const headingIds: Record<string, string> = {
      "About the team": "team",
      "Tech Stack & Open Source": "tech-stack",
      "Other Community Projects": "community",
      Projects: "projects",
    };
    for (const [text, id] of Object.entries(headingIds)) {
      const heading = [...root.querySelectorAll("h2")].find(
        (h) => (h.textContent ?? "").trim() === text,
      );
      expect(heading, text).toBeDefined();
      expect(heading?.id, text).toBe(id);
    }

    expect(searchInput().getAttribute("aria-label")).toBeTruthy();

    const nav = root.querySelector('nav[aria-label="On this page"]');
    expect(nav).not.toBeNull();
    const jumpLabels = [...(nav?.querySelectorAll("button") ?? [])].map((b) =>
      (b.textContent ?? "").trim(),
    );
    expect(jumpLabels).toEqual(["Projects", "Team", "Tech stack", "Community"]);
  });

  it("shows the empty state and no search input when the doc is missing", () => {
    createPage();
    pushSnapshot(undefined);

    expect(root.querySelector('[data-testid="about-empty"]')).not.toBeNull();
    expect(root.querySelector('input[type="search"]')).toBeNull();
  });

  it("shows a no-results message for an unmatched search and Clear restores the sections", () => {
    createPage();
    pushSnapshot(FULL_DOC);

    typeSearch("zzz-no-match");

    const message = root.querySelector('[data-testid="about-no-results"]');
    expect(message?.textContent).toContain("zzz-no-match");
    expect(root.querySelector("h2#projects")).toBeNull();

    buttonWithText("Clear").click();
    detect();

    expect(root.querySelector('[data-testid="about-no-results"]')).toBeNull();
    expect(searchInput().value).toBe("");
    expect(root.querySelector("h2#projects")).not.toBeNull();
    expect(root.querySelector("h2#team")).not.toBeNull();
  });

  it("shows an alert with Retry on snapshot error, and Retry re-subscribes", () => {
    createPage();
    latestCallbacks().error();
    detect();

    const alert = root.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);

    buttonWithText("Retry").click();
    detect();

    expect(firestore.unsubscribe).toHaveBeenCalledTimes(1);
    expect(firestore.onSnapshot).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it("disables Save while the write is pending, ignores a second click, and closes on success", async () => {
    auth.isAdmin.set(true);
    createPage();
    pushSnapshot(FULL_DOC);

    buttonWithText("Edit").click();
    detect();

    let resolveSave: () => void = () => undefined;
    firestore.setDoc.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );

    const saveButton = buttonWithText("Save");
    saveButton.click();
    detect();

    expect(saveButton.disabled).toBe(true);
    expect(saveButton.textContent?.trim()).toBe("Saving…");

    saveButton.click();
    detect();
    expect(firestore.setDoc).toHaveBeenCalledTimes(1);

    resolveSave();
    await fixture.whenStable();
    detect();

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(root.querySelector('select[aria-label="Status"]')).toBeNull();
    expect(buttonWithText("Edit")).toBeDefined();
  });

  it("keeps a legacy row without `display` hidden on the public page and after saving", async () => {
    auth.isAdmin.set(true);
    createPage();
    pushSnapshot(LEGACY_DOC);

    expect(root.querySelector("h2#projects")).toBeNull();
    expect(root.querySelector("h2#team")).toBeNull();
    expect(root.textContent).not.toContain("Legacy Project");
    expect(root.textContent).not.toContain("Legacy Person");

    buttonWithText("Edit").click();
    detect();
    buttonWithText("Save").click();
    await fixture.whenStable();
    detect();

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const payload = firestore.setDoc.mock.calls[0][1] as {
      projects: Array<{ name: string; display: boolean }>;
      personnel: Array<{ name: string; display: boolean }>;
    };
    expect(payload.projects.find((p) => p.name === "Legacy Project")?.display).toBe(false);
    expect(payload.personnel.find((p) => p.name === "Legacy Person")?.display).toBe(false);
  });
});
