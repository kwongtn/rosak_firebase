import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { RecaptchaService } from "../../../core/recaptcha/recaptcha.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { DELETE_EVENT_MUTATION, type MyEvent, type PublicUserData } from "../data/profile.queries";
import { MySpottingsComponent } from "./my-spottings.component";

function makeEvent(id: string, overrides: Partial<MyEvent> = {}): MyEvent {
  return {
    id,
    spottingDate: "2026-09-18",
    notes: null,
    created: "2026-09-18T08:00:00Z",
    status: "IN_SERVICE",
    type: "AT_STATION",
    runNumber: null,
    mediaCount: 0,
    isMine: true,
    vehicle: {
      id: "29",
      status: "IN_SERVICE",
      identificationNo: "105",
      vehicleType: { internalName: "SCS" },
      lines: [{ id: "2", code: "MRT KGL" }],
    },
    ...overrides,
  };
}

function makeUser(spottings: MyEvent[] | null): PublicUserData {
  return {
    nickname: "Alice",
    spottingsCount: spottings?.length ?? 0,
    mediaCount: 0,
    spottingTrends: [],
    withMostEntriesMonth: null,
    withMostEntriesDay: null,
    favouriteVehicles: [],
    spottingDataPublic: spottings !== null,
    spottings,
  };
}

/** `count` distinct events with ids `from`, `from + 1`, ... (strings, as the API sends them). */
function makeEvents(count: number, from = 1): MyEvent[] {
  return Array.from({ length: count }, (_, i) => makeEvent(String(from + i)));
}

/** A request the test resolves by hand, so an export can be left paused between two pages. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** A Blob's text, through FileReader because the test DOM's Blob has no `text()` on every runner. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("MySpottingsComponent", () => {
  let fixture: ComponentFixture<MySpottingsComponent>;
  let requestMock: ReturnType<typeof vi.fn>;
  let recaptchaExecute: ReturnType<typeof vi.fn>;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    // The notes sheet's breakpoint observer and the hover-capability probe both read matchMedia.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    requestMock = vi.fn();
    recaptchaExecute = vi.fn(async () => "captcha");
    toast = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [MySpottingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { idToken: vi.fn(async () => "token") } },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: RecaptchaService, useValue: { execute: recaptchaExecute } },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
  });

  async function render(user: PublicUserData, isOwnProfile: boolean): Promise<void> {
    fixture = TestBed.createComponent(MySpottingsComponent);
    fixture.componentRef.setInput("user", user);
    fixture.componentRef.setInput("isOwnProfile", isOwnProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function vehicleLinks(): HTMLAnchorElement[] {
    const root = fixture.nativeElement as HTMLElement;
    return [...root.querySelectorAll<HTMLAnchorElement>('[data-testid="history-vehicle-link"]')];
  }

  describe("vehicle links", () => {
    it("links each row's identification number to the vehicle page under its first line", async () => {
      await render(
        makeUser([
          makeEvent("1"),
          makeEvent("2", {
            vehicle: {
              id: "81",
              status: "IN_SERVICE",
              identificationNo: "SCS 41",
              vehicleType: { internalName: "SCS" },
              lines: [
                { id: "4", code: "KJL" },
                { id: "5", code: "AGL" },
              ],
            },
          }),
        ]),
        false,
      );

      expect(vehicleLinks().map((a) => a.textContent?.trim())).toEqual(["105", "SCS 41"]);
      expect(vehicleLinks().map((a) => a.getAttribute("href"))).toEqual([
        "/spotting/2/vehicle/29",
        "/spotting/4/vehicle/81",
      ]);
    });

    it("underlines the link at rest and shows where keyboard focus is", async () => {
      await render(makeUser([makeEvent("1")]), false);

      const classes = vehicleLinks()[0].classList;
      expect(classes.contains("underline")).toBe(true);
      expect(classes.contains("focus-visible:ring-2")).toBe(true);
    });

    it("keeps the type and line label beside the link", async () => {
      await render(makeUser([makeEvent("1")]), false);

      const label = fixture.nativeElement.querySelector("li span.text-muted-foreground");
      expect(label?.textContent?.replace(/\s+/g, " ").trim()).toBe("105 (SCS) — MRT KGL");
    });

    it("renders a vehicle on no line as plain text, not a dead link", async () => {
      await render(
        makeUser([
          makeEvent("1", {
            vehicle: {
              id: "7",
              status: "IN_SERVICE",
              identificationNo: "X 7",
              vehicleType: { internalName: "SCS" },
              lines: [],
            },
          }),
        ]),
        false,
      );

      expect(vehicleLinks()).toHaveLength(0);
      expect(fixture.nativeElement.textContent).toContain("X 7");
    });

    it("links the owner's own fetched history the same way", async () => {
      requestMock.mockResolvedValueOnce({ events: [makeEvent("1")] });

      await render(makeUser(null), true);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(vehicleLinks()).toHaveLength(1);
      });

      expect(vehicleLinks()[0].getAttribute("href")).toBe("/spotting/2/vehicle/29");
    });
  });

  describe("paging", () => {
    function loadMoreButton(): HTMLButtonElement | undefined {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Load more",
      );
    }

    it("loads the next page of 30 from where the list stopped, and drops the button on a short page", async () => {
      requestMock.mockResolvedValueOnce({ events: makeEvents(30) });
      await render(makeUser(null), true);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(loadMoreButton()).toBeDefined();
      });

      requestMock.mockResolvedValueOnce({ events: makeEvents(5, 31) });
      loadMoreButton()?.click();

      // The button reads "Loading…" while the page is in flight, so wait for the rows themselves.
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).querySelectorAll("li")).toHaveLength(35);
      });
      expect(loadMoreButton()).toBeUndefined();
      expect(requestMock.mock.calls.map(([, vars]) => vars)).toEqual([
        { limit: 30, offset: 0 },
        { limit: 30, offset: 30 },
      ]);
    });

    it("says so and keeps the list when a page fails", async () => {
      requestMock.mockRejectedValueOnce(new Error("Network down"));

      await render(makeUser(null), true);

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Couldn't load spottings", "Network down"),
      );
    });

    it("offers a Retry, not the empty message, when the first page fails, and loads it on press", async () => {
      requestMock.mockRejectedValueOnce(new Error("Network down"));
      await render(makeUser(null), true);
      await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
      fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.textContent).not.toContain("No spottings logged yet.");
      expect(root.textContent).toContain("Couldn't load your spottings.");

      requestMock.mockResolvedValueOnce({ events: makeEvents(2) });
      root.querySelector<HTMLButtonElement>('[data-testid="retry-spottings"]')?.click();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(root.querySelectorAll("li")).toHaveLength(2);
      });
      expect(root.querySelector('[data-testid="retry-spottings"]')).toBeNull();
      // The failure did not move the offset on, and did not leave the loader stuck.
      expect(requestMock.mock.calls.map(([, vars]) => vars)).toEqual([
        { limit: 30, offset: 0 },
        { limit: 30, offset: 0 },
      ]);
    });

    it("asks for the same page again when Load more is pressed after a failed page", async () => {
      requestMock.mockResolvedValueOnce({ events: makeEvents(30) });
      await render(makeUser(null), true);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(loadMoreButton()).toBeDefined();
      });
      requestMock.mockRejectedValueOnce(new Error("Network down"));
      loadMoreButton()?.click();
      await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(loadMoreButton()?.disabled).toBe(false);
      });

      requestMock.mockResolvedValueOnce({ events: makeEvents(5, 31) });
      loadMoreButton()?.click();

      await vi.waitFor(() => {
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).querySelectorAll("li")).toHaveLength(35);
      });
      expect(requestMock.mock.calls.map(([, vars]) => vars)).toEqual([
        { limit: 30, offset: 0 },
        { limit: 30, offset: 30 },
        { limit: 30, offset: 30 },
      ]);
    });
  });

  describe("delete", () => {
    const MINUTE_MS = 60 * 1000;
    const HOUR_MS = 60 * MINUTE_MS;
    const NOW = new Date("2026-10-22T12:00:00Z");

    /** An event of the owner's own, logged `ageMs` before the faked clock, with its own vehicle number. */
    function eventAged(id: string, ageMs: number): MyEvent {
      const base = makeEvent(id);
      return {
        ...base,
        created: new Date(NOW.getTime() - ageMs).toISOString(),
        vehicle: { ...base.vehicle, identificationNo: `V${id}` },
      };
    }

    const deleteButtons = (): HTMLButtonElement[] => [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '[data-testid="delete-spotting"]',
      ),
    ];
    const rowNumbers = (): (string | undefined)[] =>
      vehicleLinks().map((link) => link.textContent?.trim());

    /** Renders the owner's history with `events` as the first page, and waits for the rows. */
    async function renderOwner(events: MyEvent[]): Promise<void> {
      requestMock.mockResolvedValueOnce({ events });
      await render(makeUser(null), true);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(vehicleLinks()).toHaveLength(events.length);
      });
    }

    let confirm: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Only the clock is faked: `vi.waitFor` and the awaits in the component keep real timers.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
      confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    });

    afterEach(() => {
      confirm.mockRestore();
      vi.useRealTimers();
    });

    it("offers delete for an entry inside the 3-day window and not past it", async () => {
      await renderOwner([
        eventAged("1", 2 * 24 * HOUR_MS + 23 * HOUR_MS), // 2d23h
        eventAged("2", 3 * 24 * HOUR_MS - MINUTE_MS), // 2d23h59m: `vi.waitFor` ticks the faked clock
        eventAged("3", 3 * 24 * HOUR_MS + HOUR_MS), // 3d1h
      ]);

      const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll("li")];
      expect(
        rows.map((li) => li.querySelector('[data-testid="delete-spotting"]') !== null),
      ).toEqual([true, true, false]);
    });

    it("removes the row once the backend accepts the delete, and says so", async () => {
      await renderOwner([
        eventAged("1", HOUR_MS),
        eventAged("2", HOUR_MS),
        eventAged("3", HOUR_MS),
      ]);
      requestMock.mockResolvedValueOnce({ deleteEvent: { ok: true } });

      deleteButtons()[0].click();

      await vi.waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("Deletion of spotting entry #1 successful."),
      );
      fixture.detectChanges();
      expect(rowNumbers()).toEqual(["V2", "V3"]);
      expect(recaptchaExecute).toHaveBeenCalledWith("deleteSpottingEntry");
      const [query, variables, headers] = requestMock.mock.calls.at(-1)!;
      expect(query).toBe(DELETE_EVENT_MUTATION);
      expect(variables).toEqual({ deleteEventInput: { id: "1" } });
      expect(headers).toEqual({ "g-recaptcha-response": "captcha", "firebase-auth-key": "token" });
      expect(deleteButtons().every((button) => !button.disabled)).toBe(true);
    });

    it("keeps the row and says so when the backend answers ok: false", async () => {
      await renderOwner([eventAged("1", HOUR_MS), eventAged("2", HOUR_MS)]);
      requestMock.mockResolvedValueOnce({ deleteEvent: { ok: false } });

      deleteButtons()[0].click();

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Unknown error on deletion",
          "Please refresh the page and try again.",
        ),
      );
      fixture.detectChanges();
      expect(rowNumbers()).toEqual(["V1", "V2"]);
      expect(toast.success).not.toHaveBeenCalled();
      expect(deleteButtons().every((button) => !button.disabled)).toBe(true);
    });

    it("keeps the row and shows the failure when the request throws", async () => {
      await renderOwner([eventAged("1", HOUR_MS)]);
      requestMock.mockRejectedValueOnce(new Error("Network down"));

      deleteButtons()[0].click();

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Couldn't delete", "Network down"),
      );
      fixture.detectChanges();
      expect(rowNumbers()).toEqual(["V1"]);
      expect(deleteButtons()[0].disabled).toBe(false);
    });

    it("never offers delete on another user's recent entry", async () => {
      await render(makeUser([eventAged("1", HOUR_MS)]), false);

      expect(vehicleLinks()).toHaveLength(1);
      expect(deleteButtons()).toHaveLength(0);
    });

    it("fetches the older page when the owner deletes every row that was loaded", async () => {
      await renderOwner([eventAged("1", HOUR_MS)]);
      // As after a full page: more history sits behind it, so the list must not read as empty.
      fixture.componentInstance["_hasMore"].set(true);
      requestMock.mockResolvedValueOnce({ deleteEvent: { ok: true } });
      requestMock.mockResolvedValueOnce({ events: [eventAged("2", 5 * 24 * HOUR_MS)] });

      deleteButtons()[0].click();

      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(rowNumbers()).toEqual(["V2"]);
      });
      expect(requestMock.mock.calls.at(-1)![1]).toEqual({ limit: 30, offset: 0 });
    });

    it("does nothing when the owner cancels the confirmation", async () => {
      await renderOwner([eventAged("1", HOUR_MS)]);
      confirm.mockReturnValue(false);

      deleteButtons()[0].click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(recaptchaExecute).not.toHaveBeenCalled();
      expect(requestMock).toHaveBeenCalledTimes(1); // the history read alone
      expect(rowNumbers()).toEqual(["V1"]);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe("export", () => {
    /** What the browser was asked to download, in order. */
    let downloads: { filename: string; blob: Blob }[];

    beforeEach(() => {
      downloads = [];
      let lastBlob: Blob | undefined;
      // Spied on the real `URL` (a replacement object would break `new URL()` for everything else in
      // the page) and restored below, never deleted: later spec files in this worker share this `URL`
      // (see "Unit-test isolation" in docs/COMPONENTS.md).
      vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
        lastBlob = blob as Blob;
        return "blob:fake";
      });
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloads.push({ filename: this.getAttribute("download") ?? "", blob: lastBlob as Blob });
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const byTestId = (id: string): HTMLButtonElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        `[data-testid="${id}"]`,
      );

    /** Renders the owner's history with `firstPage` as the list's first page, and waits for it. */
    async function renderOwner(firstPage: MyEvent[]): Promise<void> {
      requestMock.mockResolvedValueOnce({ events: firstPage });
      await render(makeUser(null), true);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(byTestId("export-csv")).not.toBeNull();
      });
    }

    it("offers CSV and JSON to the owner, once there is a history to export", async () => {
      await renderOwner(makeEvents(3));

      expect(byTestId("export-csv")?.textContent?.trim()).toBe("Export CSV");
      expect(byTestId("export-json")?.textContent?.trim()).toBe("Export JSON");
    });

    it("offers nothing on an empty history", async () => {
      requestMock.mockResolvedValueOnce({ events: [] });

      await render(makeUser(null), true);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).textContent).toContain(
          "No spottings logged yet.",
        );
      });

      expect(byTestId("export-csv")).toBeNull();
      expect(byTestId("export-json")).toBeNull();
    });

    it("never offers it on someone else's profile", async () => {
      await render(makeUser([makeEvent("1")]), false);

      expect(byTestId("export-csv")).toBeNull();
      expect(byTestId("export-json")).toBeNull();
    });

    it("exports a history that fits the loaded page without asking for more", async () => {
      await renderOwner(makeEvents(3));

      byTestId("export-csv")?.click();

      await vi.waitFor(() => expect(downloads).toHaveLength(1));
      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(downloads[0].filename).toBe("mlptf-my-spottings.csv");
      const lines = (await blobText(downloads[0].blob)).split("\r\n");
      expect(lines[0]).toBe(
        "date,vehicle,line,type,status,notes,runNumber,origin,destination,mediaCount",
      );
      expect(lines[1]).toBe("2026-09-18,105,MRT KGL,AT_STATION,IN_SERVICE,,,,,0");
      expect(lines).toHaveLength(5);
      expect(toast.success).toHaveBeenCalledWith("Exported 3 spottings");
    });

    it("pages on past the loaded pages until a short page, showing its progress", async () => {
      await renderOwner(makeEvents(30));
      const last = deferred<{ events: MyEvent[] }>();
      requestMock
        .mockResolvedValueOnce({ events: makeEvents(200, 31) })
        .mockReturnValueOnce(last.promise);

      byTestId("export-csv")?.click();

      // Paused on the last page: 30 loaded plus the 200 just fetched.
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).textContent).toContain("Preparing 230 rows…");
      });
      expect(byTestId("export-csv")?.disabled).toBe(true);
      expect(byTestId("export-json")?.disabled).toBe(true);
      expect(requestMock.mock.calls.map(([, vars]) => vars)).toEqual([
        { limit: 30, offset: 0 },
        { limit: 200, offset: 30 },
        { limit: 200, offset: 230 },
      ]);
      expect(downloads).toHaveLength(0);

      last.resolve({ events: makeEvents(50, 231) });
      await vi.waitFor(() => expect(downloads).toHaveLength(1));
      fixture.detectChanges();

      const lines = (await blobText(downloads[0].blob)).split("\r\n");
      expect(lines).toHaveLength(1 + 280 + 1);
      expect(byTestId("export-progress")).toBeNull();
      expect(byTestId("export-csv")?.disabled).toBe(false);
      expect(toast.success).toHaveBeenCalledWith("Exported 280 spottings");
      // The export gathers into its own array, so the list still shows only what it loaded.
      expect((fixture.nativeElement as HTMLElement).querySelectorAll("li")).toHaveLength(30);
    });

    it("downloads the same rows as JSON, keyed by the CSV column names", async () => {
      await renderOwner([
        makeEvent("1", {
          notes: "Platform 2, late",
          runNumber: "R12",
          mediaCount: 2,
          originStation: { displayName: "Ampang" },
        }),
        makeEvent("2"),
      ]);

      byTestId("export-json")?.click();

      await vi.waitFor(() => expect(downloads).toHaveLength(1));
      expect(downloads[0].filename).toBe("mlptf-my-spottings.json");
      expect(downloads[0].blob.type).toBe("application/json;charset=utf-8;");
      expect(JSON.parse(await blobText(downloads[0].blob))).toEqual([
        {
          date: "2026-09-18",
          vehicle: "105",
          line: "MRT KGL",
          type: "AT_STATION",
          status: "IN_SERVICE",
          notes: "Platform 2, late",
          runNumber: "R12",
          origin: "Ampang",
          destination: null,
          mediaCount: 2,
        },
        {
          date: "2026-09-18",
          vehicle: "105",
          line: "MRT KGL",
          type: "AT_STATION",
          status: "IN_SERVICE",
          notes: null,
          runNumber: null,
          origin: null,
          destination: null,
          mediaCount: 0,
        },
      ]);
    });

    it("lists a spotting repeated across two pages once", async () => {
      await renderOwner(makeEvents(30));
      // A spotting logged elsewhere meanwhile shifts the history, so event 30 comes round again.
      requestMock.mockResolvedValueOnce({ events: [...makeEvents(1, 30), ...makeEvents(1, 31)] });

      byTestId("export-csv")?.click();

      await vi.waitFor(() => expect(downloads).toHaveLength(1));
      expect(toast.success).toHaveBeenCalledWith("Exported 31 spottings");
    });

    it("downloads nothing and says so when a page fails, then lets the owner try again", async () => {
      await renderOwner(makeEvents(30));
      requestMock.mockRejectedValueOnce(new Error("Network down"));

      byTestId("export-csv")?.click();

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Couldn't export spottings", "Network down"),
      );
      fixture.detectChanges();
      expect(downloads).toHaveLength(0);
      expect(toast.success).not.toHaveBeenCalled();
      expect(byTestId("export-progress")).toBeNull();
      expect(byTestId("export-csv")?.disabled).toBe(false);
    });

    describe("beside a delete", () => {
      /** Events logged just now, which are inside the 3-day window so each has a delete button. */
      const recentEvents = (count: number): MyEvent[] =>
        makeEvents(count).map((event) => ({ ...event, created: new Date().toISOString() }));

      const deleteButtons = (): HTMLButtonElement[] => [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '[data-testid="delete-spotting"]',
        ),
      ];

      it("keeps delete off while the export pages, so a removed row cannot shift a later page", async () => {
        await renderOwner(recentEvents(30));
        expect(deleteButtons()).toHaveLength(30);
        expect(deleteButtons().every((button) => !button.disabled)).toBe(true);
        const last = deferred<{ events: MyEvent[] }>();
        requestMock.mockReturnValueOnce(last.promise);

        byTestId("export-csv")?.click();
        await vi.waitFor(() => {
          fixture.detectChanges();
          expect(byTestId("export-progress")).not.toBeNull();
        });

        expect(deleteButtons().every((button) => button.disabled)).toBe(true);
        expect(deleteButtons()[0].title).toBe("Wait for the export to finish");

        last.resolve({ events: [] });
        await vi.waitFor(() => expect(downloads).toHaveLength(1));
        fixture.detectChanges();
        expect(deleteButtons().every((button) => !button.disabled)).toBe(true);
        expect(deleteButtons()[0].title).toBe("Delete");
      });

      it("keeps export off while a delete is in flight, for the same reason", async () => {
        vi.spyOn(window, "confirm").mockReturnValue(true);
        await renderOwner(recentEvents(3));
        const removal = deferred<{ deleteEvent: { ok: boolean } }>();
        requestMock.mockReturnValueOnce(removal.promise);

        deleteButtons()[0].click();
        await vi.waitFor(() => {
          fixture.detectChanges();
          expect(byTestId("export-csv")?.disabled).toBe(true);
        });
        expect(byTestId("export-json")?.disabled).toBe(true);

        removal.resolve({ deleteEvent: { ok: true } });
        await vi.waitFor(() => {
          fixture.detectChanges();
          expect(byTestId("export-csv")?.disabled).toBe(false);
        });
        expect(byTestId("export-json")?.disabled).toBe(false);
      });
    });

    it("stops paging and downloads nothing when the page is left mid-export", async () => {
      await renderOwner(makeEvents(30));
      const second = deferred<{ events: MyEvent[] }>();
      requestMock.mockReturnValueOnce(second.promise);

      byTestId("export-csv")?.click();
      await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
      fixture.destroy();
      second.resolve({ events: makeEvents(200, 31) });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(downloads).toHaveLength(0);
      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
});
