import { provideZonelessChangeDetection, signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { VEHICLE_EVENTS_QUERY, type SpottingEvent } from "../../data/spotting.queries";
import { SpottingHistoryComponent } from "./spotting-history.component";

function makeEvent(id: string, overrides: Partial<SpottingEvent> = {}): SpottingEvent {
  return {
    id,
    spottingDate: "2026-10-01",
    status: "IN_SERVICE",
    type: "JUST_SPOTTING",
    notes: null,
    runNumber: null,
    mediaCount: 0,
    isMine: false,
    wheelStatus: null,
    originStation: null,
    destinationStation: null,
    ...overrides,
  };
}

/** `n` spottings in one month, enough to fill (20) or not fill (fewer) a page. */
function page(prefix: string, n = 20): SpottingEvent[] {
  return Array.from({ length: n }, (_, i) => makeEvent(`${prefix}${i}`));
}

/** A node's text with runs of whitespace (template indentation, line breaks) folded to one space. */
function textOf(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** A page request the test answers by hand, so that it can land after a newer one. */
function pending() {
  let answer!: (events: SpottingEvent[]) => void;
  const promise = new Promise<{ events: SpottingEvent[] }>((resolve) => {
    answer = (events) => resolve({ events });
  });
  return { promise, answer };
}

describe("SpottingHistoryComponent", () => {
  let fixture: ComponentFixture<SpottingHistoryComponent>;
  let request: ReturnType<typeof vi.fn>;
  let isLoggedIn: WritableSignal<boolean>;

  beforeEach(async () => {
    request = vi.fn();
    isLoggedIn = signal(false);
    await TestBed.configureTestingModule({
      imports: [SpottingHistoryComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: GraphQLClient, useValue: { request } },
        { provide: AuthService, useValue: { isLoggedIn } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  function create(vehicleId = "103"): void {
    fixture = TestBed.createComponent(SpottingHistoryComponent);
    fixture.componentRef.setInput("vehicleId", vehicleId);
    fixture.detectChanges();
  }

  /** Lets every promise the component is waiting on settle, then renders the result. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
    fixture.detectChanges();
  }

  /** Renders the list with `events` as the first (and only) page the backend answers. */
  async function render(events: SpottingEvent[]): Promise<void> {
    request.mockResolvedValue({ events });
    create();
    await settle();
  }

  /** Changes who is signed in and lets the component react to it. */
  async function setSignedIn(value: boolean): Promise<void> {
    isLoggedIn.set(value);
    fixture.detectChanges();
    await settle();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLElement[] {
    return [...root().querySelectorAll<HTMLElement>('[data-testid="history-row"]')];
  }

  function yoursTags(): Element[] {
    return [...root().querySelectorAll('[data-testid="history-yours"]')];
  }

  function loadMoreButton(): HTMLButtonElement | null {
    return root().querySelector("button");
  }

  async function clickLoadMore(): Promise<void> {
    loadMoreButton()?.click();
    await settle();
  }

  it("asks for the fields its rows render, one page of 20 at a time", async () => {
    await render([makeEvent("a")]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(VEHICLE_EVENTS_QUERY, {
      vehicleId: "103",
      limit: 20,
      offset: 0,
    });
    // The template reads these four; dropping one from the document would blank its element
    // without any other test noticing.
    for (const field of ["runNumber", "mediaCount", "isMine", "wheelStatus"]) {
      expect(VEHICLE_EVENTS_QUERY).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  describe("loading and empty states", () => {
    it("shows a skeleton, not the empty state, until the first page lands", async () => {
      const first = pending();
      request.mockReturnValueOnce(first.promise);
      create();
      await settle();

      expect(root().querySelector("[hlmskeleton]")).not.toBeNull();
      expect(textOf(root())).not.toContain("No spottings logged yet.");

      first.answer([makeEvent("a")]);
      await settle();

      expect(root().querySelector("[hlmskeleton]")).toBeNull();
      expect(rows()).toHaveLength(1);
    });

    it("says so when the vehicle has no spottings", async () => {
      await render([]);

      expect(textOf(root())).toContain("No spottings logged yet.");
      expect(root().querySelector("[hlmskeleton]")).toBeNull();
    });
  });

  describe("who is asking", () => {
    it("sends only the query and its variables: the auth interceptor adds a signed-in viewer's token", async () => {
      isLoggedIn.set(true);
      await render([makeEvent("a")]);

      expect(request.mock.calls[0]).toEqual([
        VEHICLE_EVENTS_QUERY,
        { vehicleId: "103", limit: 20, offset: 0 },
      ]);
    });

    it("sends an anonymous viewer's request at once, not a turn later", () => {
      request.mockResolvedValue({ events: [] });

      create();

      // Nothing was awaited since the component was created: only the interceptor waits for a
      // signed-in viewer's token, so the server and a first paint ask as soon as they can.
      expect(request).toHaveBeenCalledTimes(1);
    });

    it("tags a signed-in viewer's own entries, which the backend finds from the token", async () => {
      isLoggedIn.set(true);
      await render([makeEvent("a", { isMine: true })]);

      expect(request).toHaveBeenCalledTimes(1);
      expect(yoursTags()).toHaveLength(1);
    });

    it("asks for the first page again when the viewer signs in, and swaps the rows in where they stand", async () => {
      await render([makeEvent("a"), makeEvent("b")]);
      expect(yoursTags()).toHaveLength(0);

      const signedIn = pending();
      request.mockReturnValueOnce(signedIn.promise);
      await setSignedIn(true);

      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenLastCalledWith(VEHICLE_EVENTS_QUERY, {
        vehicleId: "103",
        limit: 20,
        offset: 0,
      });
      // The anonymous rows stay up while the answer is on its way: no skeleton, no empty state.
      expect(rows()).toHaveLength(2);
      expect(root().querySelector("[hlmskeleton]")).toBeNull();

      signedIn.answer([makeEvent("a", { isMine: true }), makeEvent("b")]);
      await settle();

      // Replaced, not appended to.
      expect(rows()).toHaveLength(2);
      expect(
        rows().map((row) => row.querySelector('[data-testid="history-yours"]') !== null),
      ).toEqual([true, false]);
    });

    it("asks again when the viewer signs out, and the tags go", async () => {
      isLoggedIn.set(true);
      await render([makeEvent("a", { isMine: true })]);
      expect(yoursTags()).toHaveLength(1);

      request.mockResolvedValue({ events: [makeEvent("a", { isMine: false })] });
      await setSignedIn(false);

      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenLastCalledWith(VEHICLE_EVENTS_QUERY, {
        vehicleId: "103",
        limit: 20,
        offset: 0,
      });
      expect(yoursTags()).toHaveLength(0);
    });

    it("does not ask again while the viewer stays the same", async () => {
      await render([makeEvent("a")]);

      await setSignedIn(false);

      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  describe("a request that has been replaced", () => {
    it("is dropped when it lands first: the viewer changed, and the old answer is anonymous", async () => {
      const anonymous = pending();
      const signedIn = pending();
      request.mockReturnValueOnce(anonymous.promise).mockReturnValueOnce(signedIn.promise);
      create();
      await settle();
      await setSignedIn(true);
      expect(request).toHaveBeenCalledTimes(2);

      anonymous.answer([makeEvent("old", { notes: "anonymous answer" })]);
      await settle();

      // Nothing is shown from it, and the list is still waiting for the newer request.
      expect(rows()).toHaveLength(0);
      expect(root().querySelector("[hlmskeleton]")).not.toBeNull();

      signedIn.answer([makeEvent("new", { isMine: true, notes: "signed-in answer" })]);
      await settle();

      expect(rows()).toHaveLength(1);
      expect(textOf(root())).toContain("signed-in answer");
      expect(textOf(root())).not.toContain("anonymous answer");
    });

    it("is dropped when it lands last: it cannot put anonymous rows over the viewer's", async () => {
      const anonymous = pending();
      const signedIn = pending();
      request.mockReturnValueOnce(anonymous.promise).mockReturnValueOnce(signedIn.promise);
      create();
      await settle();
      await setSignedIn(true);

      signedIn.answer([makeEvent("new", { isMine: true, notes: "signed-in answer" })]);
      await settle();
      anonymous.answer([makeEvent("old", { notes: "anonymous answer" })]);
      await settle();

      expect(rows()).toHaveLength(1);
      expect(yoursTags()).toHaveLength(1);
      expect(textOf(root())).not.toContain("anonymous answer");
    });

    it("cannot end the loading state of the vehicle that replaced it", async () => {
      const first = pending();
      const second = pending();
      request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      create("103");
      await settle();
      fixture.componentRef.setInput("vehicleId", "104");
      fixture.detectChanges();
      await settle();
      expect(request).toHaveBeenLastCalledWith(VEHICLE_EVENTS_QUERY, {
        vehicleId: "104",
        limit: 20,
        offset: 0,
      });

      first.answer(page("a"));
      await settle();

      // 104 is still on its way: it must not read as "No spottings logged yet.".
      expect(root().querySelector("[hlmskeleton]")).not.toBeNull();
      expect(textOf(root())).not.toContain("No spottings logged yet.");

      second.answer([makeEvent("b", { notes: "vehicle 104" })]);
      await settle();

      expect(rows()).toHaveLength(1);
      expect(textOf(root())).toContain("vehicle 104");
    });

    it("cannot change the Load more state of the vehicle that replaced it", async () => {
      const first = pending();
      const second = pending();
      request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      create("103");
      await settle();
      fixture.componentRef.setInput("vehicleId", "104");
      fixture.detectChanges();
      await settle();

      // 104 has a single spotting, so there is no next page to offer.
      second.answer([makeEvent("b", { notes: "vehicle 104" })]);
      await settle();
      expect(loadMoreButton()).toBeNull();

      // 103's full page lands late; it says "there is more", but about the wrong vehicle.
      first.answer(page("a"));
      await settle();

      expect(loadMoreButton()).toBeNull();
      expect(rows()).toHaveLength(1);
      expect(textOf(root())).toContain("vehicle 104");
    });
  });

  describe("Load more", () => {
    it("asks for the next 20 from where the list ends, and appends them", async () => {
      isLoggedIn.set(true);
      request
        .mockResolvedValueOnce({ events: page("a") })
        .mockResolvedValueOnce({ events: page("b", 5) });
      create();
      await settle();
      expect(rows()).toHaveLength(20);

      await clickLoadMore();

      expect(request).toHaveBeenLastCalledWith(VEHICLE_EVENTS_QUERY, {
        vehicleId: "103",
        limit: 20,
        offset: 20,
      });
      expect(rows()).toHaveLength(25);
      // A short page was the last one.
      expect(loadMoreButton()).toBeNull();
    });

    it("is not offered after a first page that is not full", async () => {
      await render(page("a", 3));

      expect(loadMoreButton()).toBeNull();
    });

    it("says Loading… and cannot be pressed again while a page is on its way", async () => {
      request.mockResolvedValueOnce({ events: page("a") });
      create();
      await settle();
      const next = pending();
      request.mockReturnValueOnce(next.promise);

      await clickLoadMore();

      expect(textOf(loadMoreButton())).toBe("Loading…");
      expect(loadMoreButton()?.disabled).toBe(true);

      next.answer(page("b"));
      await settle();

      expect(textOf(loadMoreButton())).toBe("Load more");
      expect(loadMoreButton()?.disabled).toBe(false);
    });

    it("carries on from the restarted first page after a sign-in, not from the rows it replaced", async () => {
      request.mockResolvedValueOnce({ events: page("a") });
      create();
      await settle();
      request.mockResolvedValueOnce({ events: page("b") });
      await clickLoadMore();
      expect(rows()).toHaveLength(40);

      request.mockResolvedValueOnce({ events: page("c") });
      await setSignedIn(true);
      expect(rows()).toHaveLength(20);

      request.mockResolvedValueOnce({ events: page("d", 3) });
      await clickLoadMore();

      expect(request).toHaveBeenLastCalledWith(VEHICLE_EVENTS_QUERY, {
        vehicleId: "103",
        limit: 20,
        offset: 20,
      });
      expect(rows()).toHaveLength(23);
    });

    it("leaves the list on screen and the button usable when a page fails", async () => {
      request.mockResolvedValueOnce({ events: page("a") });
      create();
      await settle();

      request.mockRejectedValueOnce(new Error("offline"));
      await expect(fixture.componentInstance.loadMore()).rejects.toThrow("offline");
      await settle();

      expect(rows()).toHaveLength(20);
      expect(textOf(loadMoreButton())).toBe("Load more");
      expect(loadMoreButton()?.disabled).toBe(false);
    });
  });

  describe("month headings", () => {
    it("are h3, one level under the card's h2, and never h4", async () => {
      await render([
        makeEvent("a", { spottingDate: "2026-10-12" }),
        makeEvent("b", { spottingDate: "2026-10-01" }),
        makeEvent("c", { spottingDate: "2026-09-20" }),
      ]);

      const headings = [...root().querySelectorAll("h3")].map(textOf);
      expect(headings).toEqual(["October 2026", "September 2026"]);
      expect(root().querySelector("h4")).toBeNull();
    });
  });

  describe("stations", () => {
    it("links the origin and the destination to their station pages", async () => {
      await render([
        makeEvent("a", {
          originStation: { id: "1", displayName: "KL Sentral" },
          destinationStation: { id: "65", displayName: "Abdullah Hukum" },
        }),
      ]);

      const origin = root().querySelector('[data-testid="history-origin"]');
      const destination = root().querySelector('[data-testid="history-destination"]');
      expect([origin?.tagName, textOf(origin), origin?.getAttribute("href")]).toEqual([
        "A",
        "KL Sentral",
        "/station/1",
      ]);
      expect([
        destination?.tagName,
        textOf(destination),
        destination?.getAttribute("href"),
      ]).toEqual(["A", "Abdullah Hukum", "/station/65"]);
      // The two names still read as one trip.
      expect(textOf(origin?.parentElement)).toBe("KL Sentral → Abdullah Hukum");
    });

    it("links the origin alone when no destination was logged", async () => {
      await render([makeEvent("a", { originStation: { id: "1", displayName: "KL Sentral" } })]);

      expect(root().querySelector('[data-testid="history-origin"]')?.getAttribute("href")).toBe(
        "/station/1",
      );
      expect(root().querySelector('[data-testid="history-destination"]')).toBeNull();
      expect(textOf(root().querySelector('[data-testid="history-origin"]')?.parentElement)).toBe(
        "KL Sentral",
      );
    });

    it("shows no station link for a spotting without stations", async () => {
      await render([makeEvent("a")]);

      expect(root().querySelector('[data-testid="history-origin"]')).toBeNull();
      expect(root().querySelector('a[href^="/station/"]')).toBeNull();
    });
  });

  describe("photo count", () => {
    it("shows a camera chip with the count, singular for one photo", async () => {
      await render([
        makeEvent("a", { mediaCount: 3 }),
        makeEvent("b", { mediaCount: 1 }),
        makeEvent("c", { mediaCount: 0 }),
      ]);

      const chips = [...root().querySelectorAll('[data-testid="history-media-count"]')];
      expect(chips.map(textOf)).toEqual(["3 photos", "1 photo"]);
      expect(chips[0].querySelector("ng-icon")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("is a plain chip, not a link: no gallery filter by spotting exists to point at", async () => {
      await render([makeEvent("a", { mediaCount: 2 })]);

      const chip = root().querySelector('[data-testid="history-media-count"]');
      expect(chip).not.toBeNull();
      expect(chip?.closest("a, button")).toBeNull();
      expect(chip?.querySelector("a, button")).toBeNull();
    });

    it("shows no chip for a spotting without photos", async () => {
      await render([makeEvent("a", { mediaCount: 0 })]);

      expect(root().querySelector('[data-testid="history-media-count"]')).toBeNull();
    });
  });

  describe("run number", () => {
    it('reads "Run 12"', async () => {
      await render([makeEvent("a", { runNumber: "12" })]);

      expect(textOf(root().querySelector('[data-testid="history-run-number"]'))).toBe("Run 12");
    });

    it("is left out when the spotter gave none (the API sends null or an empty string)", async () => {
      await render([makeEvent("a", { runNumber: null }), makeEvent("b", { runNumber: "" })]);

      expect(root().querySelector('[data-testid="history-run-number"]')).toBeNull();
      expect(root().querySelector('[data-testid="history-details"]')).toBeNull();
    });
  });

  describe("wheel condition", () => {
    it("shows the wheel-status badge, named so a bare word is not mistaken for the train's status", async () => {
      await render([makeEvent("a", { wheelStatus: "WORN_OUT" })]);

      const wheel = root().querySelector('[data-testid="history-wheel"]');
      expect(wheel?.querySelector("wheel-status-badge")).not.toBeNull();
      expect(textOf(wheel)).toBe("Wheels Worn Out");
    });

    it("is left out when no wheel condition was logged", async () => {
      await render([makeEvent("a", { wheelStatus: null })]);

      expect(root().querySelector('[data-testid="history-wheel"]')).toBeNull();
      expect(root().querySelector("wheel-status-badge")).toBeNull();
    });
  });

  describe('"Yours" tag', () => {
    it("marks the viewer's own entries and no one else's", async () => {
      await render([
        makeEvent("mine", { isMine: true }),
        makeEvent("theirs", { isMine: false }),
        makeEvent("mine-too", { isMine: true }),
      ]);

      const tagged = rows().map((row) => row.querySelector('[data-testid="history-yours"]'));
      expect(tagged.map((tag) => (tag ? textOf(tag) : null))).toEqual(["Yours", null, "Yours"]);
    });

    it("sits on the details line, so it cannot push the status badge off the date line", async () => {
      await render([makeEvent("mine", { isMine: true })]);

      const row = rows()[0];
      const tag = row.querySelector('[data-testid="history-yours"]');
      const details = row.querySelector('[data-testid="history-details"]');
      expect(tag).not.toBeNull();
      expect(details?.contains(tag)).toBe(true);
      // Nothing else was logged, so the tag is all that line holds.
      expect(textOf(details)).toBe("Yours");
    });
  });

  it("keeps every detail on its own row, so a bare row stays as it was", async () => {
    await render([
      makeEvent("full", {
        isMine: true,
        runNumber: "7",
        wheelStatus: "FLAT",
        mediaCount: 2,
        notes: "Seen near KLCC",
      }),
      makeEvent("bare", { notes: "Depot visit" }),
    ]);

    const [full, bare] = rows();
    // One flex item each (the layout's gap separates them, there is no whitespace text node).
    const details = full.querySelector('[data-testid="history-details"]');
    expect([...(details?.children ?? [])].map(textOf)).toEqual([
      "Yours",
      "Run 7",
      "Wheels Flat",
      "2 photos",
    ]);
    expect(textOf(full)).toContain("Seen near KLCC");
    expect(bare.querySelector('[data-testid="history-details"]')).toBeNull();
    expect(bare.querySelector('[data-testid="history-yours"]')).toBeNull();
    expect(textOf(bare)).toContain("Depot visit");
    expect(textOf(bare)).toContain("In Service");
  });
});
