import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection, signal } from "@angular/core";
import { provideMarkdown } from "ngx-markdown";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ImageUploadService } from "../../../core/upload/image-upload.service";
import type { ImageFile } from "../../../core/upload/image-file";
import { ToastService } from "../../../ui/toast/toast.service";
import { IncidentSheetService } from "../data/incident-sheet.service";
import { LinkSheetService } from "../data/link-sheet.service";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLink,
} from "../data/social-links.queries";
import {
  CALENDAR_INCIDENT_HISTORY_QUERY,
  REQUEST_CHRONOLOGY_DELETION_MUTATION,
} from "../data/insiden.queries";
import type { CalendarIncident, CalendarIncidentLinks } from "../data/insiden.queries";
import { IncidentCardComponent } from "./incident-card.component";

function makeLinkEdge(
  id: string,
  overrides: Partial<PublicSocialMediaLink> = {},
): CalendarIncidentLinks["edges"][number] {
  return {
    node: {
      id,
      url: `https://news.example.com/posts/${id}`,
      title: "",
      created: "2026-08-01T10:30:00Z",
      completed: false,
      status: "LIVE",
      lines: [],
      vehicles: [],
      stations: [],
      ...overrides,
    },
    cursor: `cursor-${id}`,
  };
}

function makeIncident(overrides: Partial<CalendarIncident> = {}): CalendarIncident {
  return {
    id: "42",
    title: "LRT line down",
    brief: "Service suspended",
    details: "",
    severity: "MAJOR",
    startDatetime: "2026-08-01T08:00:00Z",
    // Non-null so the component's ongoing-timer afterNextRender branch is skipped in tests.
    endDatetime: "2026-08-01T10:00:00Z",
    hasDetails: false,
    impactFactor: 0,
    longTerm: false,
    inaccurate: false,
    status: "LIVE",
    lastUpdated: "2026-08-01T09:00:00Z",
    lines: [],
    vehicles: [],
    stations: [],
    categories: [],
    chronologies: [],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0,
    medias: [],
    ...overrides,
  };
}

describe("IncidentCardComponent edit affordance", () => {
  let fixture: ComponentFixture<IncidentCardComponent>;
  let sheet: IncidentSheetService;
  let isLoggedIn: ReturnType<typeof signal<boolean>>;
  let isAdmin: ReturnType<typeof signal<boolean>>;
  let user: ReturnType<typeof signal<{ uid: string } | null>>;

  beforeEach(async () => {
    isLoggedIn = signal(true);
    isAdmin = signal(false);
    user = signal({ uid: "abcdef12-3456-7890-abcd-ef1234567890" });

    await TestBed.configureTestingModule({
      imports: [IncidentCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { user, isLoggedIn, isAdmin },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn().mockResolvedValue({}) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();

    sheet = TestBed.inject(IncidentSheetService);
    vi.spyOn(sheet, "open");
    fixture = TestBed.createComponent(IncidentCardComponent);
    fixture.componentRef.setInput("incident", makeIncident());
    await fixture.whenStable();
  });

  function editButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(
      '[data-testid="edit-incident"]',
    ) as HTMLButtonElement | null;
  }

  it("shows the edit button for a LIVE incident to a logged-in user", () => {
    fixture.detectChanges();
    expect(editButton()).not.toBeNull();
  });

  it("hides the edit button when logged out", () => {
    isLoggedIn.set(false);
    fixture.detectChanges();
    expect(editButton()).toBeNull();
  });

  it("hides the edit button when the host passes editActionEnabled=false", () => {
    fixture.componentRef.setInput("editActionEnabled", false);
    fixture.detectChanges();
    expect(editButton()).toBeNull();
  });

  it("hides the edit button for a non-author, non-admin on a pending incident", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({
        status: "PENDING_APPROVAL",
        user: { shortId: "zzzzzzzz" },
      }),
    );
    fixture.detectChanges();
    expect(editButton()).toBeNull();
  });

  it("shows the edit button for the author on a pending incident", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({
        status: "PENDING_APPROVAL",
        user: { shortId: "abcdef12" },
      }),
    );
    fixture.detectChanges();
    expect(editButton()).not.toBeNull();
  });

  it("opens the incident sheet with the incident on click", () => {
    fixture.detectChanges();
    editButton()?.click();
    expect(sheet.open).toHaveBeenCalledWith(fixture.componentInstance.incident());
  });
});

describe("IncidentCardComponent chronology status & votes", () => {
  let fixture: ComponentFixture<IncidentCardComponent>;

  function tagsWithText(text: string): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("span")).filter(
      (el): el is HTMLElement => el.textContent?.trim() === text,
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { user: signal(null), isLoggedIn: signal(true), isAdmin: signal(false) },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn().mockResolvedValue({}) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(IncidentCardComponent);
  });

  it("renders a Pending Approval tag on a pending_approval chronology row", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({
        chronologies: [
          {
            id: "chr-1",
            order: 0,
            indicator: "BLUE",
            datetime: "2026-08-01T08:00:00Z",
            content: "Halt at KL Sentral",
            sourceUrl: null,
            status: "PENDING_APPROVAL",
            voteScore: 3,
            voteBreakdown: { upvotes: 4, downvotes: 1 },
            userVote: 0,
          },
        ],
      }),
    );
    fixture.detectChanges();

    expect(tagsWithText("Pending Approval").length).toBe(1);
    expect(
      fixture.nativeElement.querySelector('[aria-label="Vote on this chronology"]'),
    ).not.toBeNull();
  });

  it("renders a Pending Deletion tag in both status casings and leaves live rows untagged", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({
        chronologies: [
          {
            id: "chr-1",
            order: 0,
            indicator: "RED",
            datetime: "2026-08-01T08:00:00Z",
            content: "Marked for deletion",
            sourceUrl: null,
            status: "pending_deletion",
          },
          {
            id: "chr-2",
            order: 1,
            indicator: "GREEN",
            datetime: "2026-08-01T09:00:00Z",
            content: "Fixed",
            sourceUrl: null,
            status: "LIVE",
          },
        ],
      }),
    );
    fixture.detectChanges();

    expect(tagsWithText("Pending Deletion").length).toBe(1);
    expect(tagsWithText("Pending Approval")).toHaveLength(0);
  });

  it("renders no vote buttons when chronologies carry no backend id (default timeline)", () => {
    fixture.componentRef.setInput("incident", makeIncident());
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[aria-label="Vote on this chronology"]'),
    ).toBeNull();
  });
});

describe("IncidentCardComponent chronology deletion request", () => {
  let fixture: ComponentFixture<IncidentCardComponent>;
  let requestMock: ReturnType<typeof vi.fn>;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let isLoggedIn: ReturnType<typeof signal<boolean>>;
  let isAdmin: ReturnType<typeof signal<boolean>>;

  const liveChronology = {
    id: "chr-1",
    order: 0,
    indicator: "BLUE" as const,
    datetime: "2026-08-01T08:00:00Z",
    content: "Halt at KL Sentral",
    sourceUrl: null,
    status: "LIVE" as const,
  };

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ requestChronologyDeletion: { ok: true } });
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    isLoggedIn = signal(true);
    isAdmin = signal(false);

    await TestBed.configureTestingModule({
      imports: [IncidentCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: {
            user: signal({ uid: "abcdef12-3456-7890-abcd-ef1234567890" }),
            isLoggedIn,
            isAdmin,
            idToken: async () => "token",
          },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(IncidentCardComponent);
    fixture.componentRef.setInput(
      "incident",
      makeIncident({ status: "LIVE", chronologies: [liveChronology] }),
    );
    await fixture.whenStable();
  });

  function requestButtons(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="request-chronology-deletion"]'),
    ) as HTMLButtonElement[];
  }

  function tagsWithText(text: string): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("span")).filter(
      (el): el is HTMLElement => el.textContent?.trim() === text,
    );
  }

  it("shows the affordance on a LIVE chronology row to a logged-in viewer", () => {
    fixture.detectChanges();
    expect(requestButtons()).toHaveLength(1);
  });

  it("hides the affordance when logged out", () => {
    isLoggedIn.set(false);
    fixture.detectChanges();
    expect(requestButtons()).toHaveLength(0);
  });

  it("hides the affordance for a non-editable parent (console host opt-out)", () => {
    fixture.componentRef.setInput("editActionEnabled", false);
    fixture.detectChanges();
    expect(requestButtons()).toHaveLength(0);
  });

  it("hides the affordance on non-LIVE rows (pending approval / already flagged)", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({
        status: "LIVE",
        chronologies: [
          { ...liveChronology, status: "PENDING_APPROVAL" },
          { ...liveChronology, status: "PENDING_DELETION" },
        ],
      }),
    );
    fixture.detectChanges();
    expect(requestButtons()).toHaveLength(0);
    expect(tagsWithText("Pending Approval")).toHaveLength(1);
    expect(tagsWithText("Pending Deletion")).toHaveLength(1);
  });

  it("fires the request mutation and flips the row to Pending Deletion locally", async () => {
    fixture.detectChanges();
    requestButtons()[0].click();

    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    const [mutation, vars] = requestMock.mock.calls[0];
    expect(mutation).toBe(REQUEST_CHRONOLOGY_DELETION_MUTATION);
    expect(vars).toEqual({ chronologyId: "chr-1" });
    await vi.waitFor(() => expect(tagsWithText("Pending Deletion")).toHaveLength(1));
    expect(requestButtons()).toHaveLength(0);
    expect(toast.success).toHaveBeenCalled();
  });

  it("toasts the backend error verbatim and keeps the row untouched on failure", async () => {
    requestMock.mockRejectedValueOnce(
      new Error("Only LIVE chronologies can be marked for deletion"),
    );
    fixture.detectChanges();
    requestButtons()[0].click();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't request deletion",
        "Only LIVE chronologies can be marked for deletion",
      ),
    );
    expect(tagsWithText("Pending Deletion")).toHaveLength(0);
  });
});

interface TestableCard {
  loadMoreLinks(): Promise<void>;
  loadHistory(): Promise<void>;
}

function asTestableCard(fixture: ComponentFixture<IncidentCardComponent>): TestableCard {
  return fixture.componentInstance as unknown as TestableCard;
}

describe("IncidentCardComponent incident links", () => {
  let fixture: ComponentFixture<IncidentCardComponent>;
  let linkSheet: LinkSheetService;
  let requestMock: ReturnType<typeof vi.fn>;
  let isLoggedIn: ReturnType<typeof signal<boolean>>;

  const linksPayload: CalendarIncidentLinks = {
    edges: [makeLinkEdge("live-1"), makeLinkEdge("pending-1", { status: "PENDING_APPROVAL" })],
    pageInfo: { hasNextPage: false, endCursor: "cursor-live-1" },
  };

  beforeEach(async () => {
    isLoggedIn = signal(true);
    requestMock = vi.fn().mockResolvedValue({});

    await TestBed.configureTestingModule({
      imports: [IncidentCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { user: signal({ uid: "abcdef12" }), isLoggedIn, isAdmin: signal(false) },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    }).compileComponents();

    linkSheet = TestBed.inject(LinkSheetService);
    vi.spyOn(linkSheet, "open");
    fixture = TestBed.createComponent(IncidentCardComponent);
    fixture.componentRef.setInput("incident", makeIncident({ links: linksPayload }));
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function linkLines(): HTMLAnchorElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="incident-link-line"]'),
    ) as HTMLAnchorElement[];
  }

  it("renders link rows in the spec format with new-tab hyperlinks", () => {
    const rows = linkLines();
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(first.getAttribute("href")).toBe("https://news.example.com/posts/live-1");
    expect(first.getAttribute("target")).toBe("_blank");
    expect(first.getAttribute("rel")).toContain("noopener");
    expect(first.textContent).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/);
  });

  it("renders the favicon and the bold-domain / paler-remainder split", () => {
    const favicon = fixture.nativeElement.querySelector(
      'img[src^="https://www.google.com/s2/favicons"]',
    );
    expect(favicon).not.toBeNull();
    expect(favicon?.getAttribute("src")).toContain("news.example.com");
    expect(favicon?.getAttribute("alt")).toBe("");
    expect(
      fixture.nativeElement.querySelector('a [class*="font-semibold"]')?.textContent,
    ).toContain("news.example.com");
    expect(fixture.nativeElement.textContent).toContain("/posts/live-1");
  });

  it("shows the pending icon + tooltip on user-submitted rows only", () => {
    const tooltip = fixture.nativeElement.querySelector('[aria-label="Pending approval"]');
    expect(tooltip).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Pending approval");
    expect(fixture.nativeElement.querySelectorAll('[aria-label="Pending approval"]')).toHaveLength(
      1,
    );
  });

  it("offers Add link to a logged-in user and opens the sheet with the incident context", () => {
    const add: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      '[data-testid="add-incident-link"]',
    );
    expect(add).not.toBeNull();
    add?.click();
    expect(linkSheet.open).toHaveBeenCalledWith({
      incidentId: "42",
      incidentTitle: "LRT line down",
    });
  });

  it("hides Add link when logged out or on a host that opts out (console)", () => {
    isLoggedIn.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="add-incident-link"]')).toBeNull();

    isLoggedIn.set(true);
    fixture.componentRef.setInput("editActionEnabled", false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="add-incident-link"]')).toBeNull();
  });

  it("loads continuation pages through the root query with the nested page cursor", async () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({
        links: { ...linksPayload, pageInfo: { hasNextPage: true, endCursor: "cursor-live-1" } },
      }),
    );
    await fixture.whenStable();
    requestMock.mockResolvedValueOnce({
      publicSocialMediaLinks: {
        edges: [makeLinkEdge("page-2-1")],
        pageInfo: { hasNextPage: false, endCursor: "cursor-page-2-1" },
      },
    });

    await asTestableCard(fixture).loadMoreLinks();

    expect(requestMock).toHaveBeenCalledWith(PUBLIC_SOCIAL_MEDIA_LINKS_QUERY, {
      first: 10,
      after: "cursor-live-1",
      incidentId: "42",
    });
    fixture.detectChanges();
    expect(linkLines()).toHaveLength(3);
  });

  it("swaps the sentinel for an inline retry when a continuation page fails", async () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({
        links: { ...linksPayload, pageInfo: { hasNextPage: true, endCursor: "cursor-live-1" } },
      }),
    );
    await fixture.whenStable();
    requestMock.mockRejectedValueOnce(new Error("links unavailable"));
    await asTestableCard(fixture).loadMoreLinks();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="retry-card-links"]')).not.toBeNull();
  });
});

describe("IncidentCardComponent photo preview & inline add", () => {
  let fixture: ComponentFixture<IncidentCardComponent>;

  function makePhoto(id: string, url: string): CalendarIncident["medias"][number] {
    return {
      id,
      file: { url },
      width: 1200,
      height: 800,
      uploader: { nickname: "spotter123" },
    };
  }

  function expandPhotos(): void {
    const toggle = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Photos")) as HTMLButtonElement | undefined;
    toggle?.click();
    fixture.detectChanges();
  }

  function photoGrid(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="incident-photo-grid"]',
    );
  }

  function thumbnails(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="incident-photo-thumbnail"]',
      ),
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { user: signal(null), isLoggedIn: signal(true), isAdmin: signal(false) },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn().mockResolvedValue({}) } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
        { provide: ImageUploadService, useValue: { addToQueue: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IncidentCardComponent);
  });

  it("renders photo thumbnails as in-page buttons (no new-tab anchors) in the photos grid", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({
        medias: [
          makePhoto("m1", "https://cdn.example.com/m1.jpg"),
          makePhoto("m2", "https://cdn.example.com/m2.jpg"),
        ],
      }),
    );
    fixture.detectChanges();
    expandPhotos();

    const grid = photoGrid();
    expect(grid).not.toBeNull();
    expect(thumbnails()).toHaveLength(2);
    expect(grid?.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("opens the gallery MediaViewerComponent in the same page on thumbnail click", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({ medias: [makePhoto("m1", "https://cdn.example.com/m1.jpg")] }),
    );
    fixture.detectChanges();
    expandPhotos();

    thumbnails()[0].click();
    fixture.detectChanges();

    const viewer = fixture.nativeElement.querySelector("app-media-viewer") as HTMLElement | null;
    expect(viewer).not.toBeNull();
    const img = viewer?.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://cdn.example.com/m1.jpg");
    expect(viewer?.textContent).toContain("spotter123");

    (viewer?.querySelector('button[aria-label="Close"]') as HTMLButtonElement | null)?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("app-media-viewer")).toBeNull();
  });

  it("keeps Add Photo as an inline cell inside the same grid flow, not a separate section", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({ medias: [makePhoto("m1", "https://cdn.example.com/m1.jpg")] }),
    );
    fixture.detectChanges();
    expandPhotos();

    const grid = photoGrid();
    const addCell = grid?.querySelector('button[aria-label="Add photo"]') as HTMLElement | null;
    expect(addCell).not.toBeNull();
    expect(addCell?.className).toContain("size-20");
  });

  it("leaves the upload pipeline untouched: pending photos still queue with the incident id", () => {
    fixture.componentRef.setInput(
      "incident",
      makeIncident({ medias: [makePhoto("m1", "https://cdn.example.com/m1.jpg")] }),
    );
    fixture.detectChanges();
    expandPhotos();

    const pendingPhotos = (
      fixture.componentInstance as unknown as {
        pendingPhotos: ReturnType<typeof signal<ImageFile[]>>;
      }
    ).pendingPhotos;
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    pendingPhotos.set([{ file, toCompress: false, isCompressed: true }]);
    fixture.detectChanges();

    const uploadButton = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
    ).find((b) => b.textContent?.includes("Upload 1 photo")) as HTMLButtonElement | undefined;
    expect(uploadButton).not.toBeNull();
    uploadButton?.click();

    const uploadService = TestBed.inject(ImageUploadService);
    expect(uploadService.addToQueue).toHaveBeenCalledWith(
      "42",
      { file, toCompress: false, isCompressed: true },
      "INCIDENT_CALENDAR_INCIDENT",
    );
    expect(pendingPhotos()).toHaveLength(0);
  });
});

describe("IncidentCardComponent history line", () => {
  let fixture: ComponentFixture<IncidentCardComponent>;
  let requestMock: ReturnType<typeof vi.fn>;
  let isLoggedIn: ReturnType<typeof signal<boolean>>;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  const updatedEntry = {
    timestamp: "2026-08-01T09:30:00",
    actor: "alice",
    changeType: "updated" as const,
    changedFields: ["title", "brief"],
  };

  beforeEach(async () => {
    isLoggedIn = signal(true);
    requestMock = vi.fn().mockResolvedValue({ calendarIncidentHistory: [updatedEntry] });
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [IncidentCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        // The details area renders <markdown> (the history line lives at its top), so the
        // ngx-markdown service is needed whenever an incident has details.
        provideMarkdown(),
        {
          provide: AuthService,
          useValue: {
            user: signal({ uid: "abcdef12" }),
            isLoggedIn,
            isAdmin: signal(false),
            idToken: async () => "token",
          },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IncidentCardComponent);
    fixture.componentRef.setInput("incident", makeIncident({ hasDetails: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function detailsToggle(): HTMLButtonElement | null {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Show details"),
    ) as HTMLButtonElement | null;
  }

  function historyLine(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="incident-history-line"]',
    );
  }

  it("fetches the latest entry lazily on expand (limit 1, id-token headers) and not before", async () => {
    expect(requestMock).not.toHaveBeenCalled();
    expect(historyLine()).toBeNull();

    detailsToggle()?.click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    const [query, vars, headers] = requestMock.mock.calls[0];
    expect(query).toBe(CALENDAR_INCIDENT_HISTORY_QUERY);
    expect(vars).toEqual({ id: "42", limit: 1 });
    expect(headers).toEqual({ "firebase-auth-key": "token" });

    await vi.waitFor(() => expect(historyLine()).not.toBeNull());
  });

  it("renders the latest updated entry as one line with readable changed fields", async () => {
    detailsToggle()?.click();
    await vi.waitFor(() => expect(historyLine()).not.toBeNull());
    expect(historyLine()?.textContent?.trim()).toBe(
      "Last updated Aug 1, 2026 09:30 by alice — changed: title, brief",
    );
  });

  it("renders a creation record as 'Created … by …'", async () => {
    requestMock.mockResolvedValueOnce({
      calendarIncidentHistory: [
        {
          timestamp: "2026-08-01T08:00:00",
          actor: "bob",
          changeType: "created",
          changedFields: ["created"],
        },
      ],
    });
    detailsToggle()?.click();
    await vi.waitFor(() =>
      expect(historyLine()?.textContent?.trim()).toBe("Created Aug 1, 2026 08:00 by bob"),
    );
  });

  it("renders 'system' when the actor is null", async () => {
    requestMock.mockResolvedValueOnce({
      calendarIncidentHistory: [
        {
          timestamp: "2026-08-01T09:30:00",
          actor: null,
          changeType: "updated",
          changedFields: ["title"],
        },
      ],
    });
    detailsToggle()?.click();
    await vi.waitFor(() =>
      expect(historyLine()?.textContent?.trim()).toBe(
        "Last updated Aug 1, 2026 09:30 by system — changed: title",
      ),
    );
  });

  it("never queries and hides the line for a logged-out viewer", async () => {
    isLoggedIn.set(false);
    fixture.detectChanges();
    detailsToggle()?.click();
    await fixture.whenStable();
    expect(requestMock).not.toHaveBeenCalled();
    expect(historyLine()).toBeNull();
  });

  it("hides the line without toast/retry chrome when the request fails", async () => {
    requestMock.mockRejectedValueOnce(new Error("unauthenticated"));
    await asTestableCard(fixture).loadHistory();
    fixture.detectChanges();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(historyLine()).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("refetches for a new incident id while still expanded and drops the old line", async () => {
    detailsToggle()?.click();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    fixture.componentRef.setInput("incident", makeIncident({ id: "99", hasDetails: true }));
    await fixture.whenStable();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    expect(requestMock.mock.calls[1][1]).toEqual({ id: "99", limit: 1 });
  });

  it("keeps the line on a same-id payload refresh (no re-fetch)", async () => {
    detailsToggle()?.click();
    await vi.waitFor(() => expect(historyLine()).not.toBeNull());

    fixture.componentRef.setInput("incident", makeIncident({ hasDetails: true }));
    await fixture.whenStable();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(historyLine()).not.toBeNull();
  });
});
