import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaNode } from "../data/gallery.queries";
import { JustifiedGridComponent } from "../justified-grid/justified-grid.component";
import { MediaViewerComponent } from "./media-viewer.component";

function photo(id: string, nickname = "spotter123"): MediaNode {
  return {
    id,
    createdDate: "2024-05-12",
    width: 400,
    height: 300,
    file: { url: `https://i.imgur.com/${id}.jpg` },
    uploader: { nickname },
  };
}

beforeEach(() => {
  // jsdom does no layout, and the CDK focus trap skips every element that has no box, so it would
  // find nothing to focus. Give every element a box.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

describe("MediaViewerComponent", () => {
  let fixture: ComponentFixture<MediaViewerComponent>;

  async function open(media: MediaNode): Promise<HTMLElement> {
    fixture = TestBed.createComponent(MediaViewerComponent);
    fixture.componentRef.setInput("media", media);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it("is a labelled modal dialog", async () => {
    const viewer = await open(photo("a"));

    expect(viewer.getAttribute("role")).toBe("dialog");
    expect(viewer.getAttribute("aria-modal")).toBe("true");
    expect(viewer.getAttribute("aria-label")).toBe("Photo viewer");
  });

  it("describes the photo in the image alt, with the words its thumbnail is labelled with", async () => {
    const viewer = await open(photo("a"));

    expect(viewer.querySelector("img")!.getAttribute("alt")).toBe(
      "Photo by spotter123, 12 May 2024",
    );
  });

  it("shows the photo with no 'Uploaded by' row when the backend hides the uploader", async () => {
    const viewer = await open({ ...photo("a"), uploader: null });

    expect(viewer.querySelector("img")!.getAttribute("alt")).toBe("Photo, 12 May 2024");
    expect(viewer.textContent).not.toContain("Uploaded by");
    expect(viewer.textContent).toContain("Uploaded on");
  });

  it("names the uploader in the details when there is one", async () => {
    const viewer = await open(photo("a"));

    expect(viewer.textContent).toContain("Uploaded by");
    expect(viewer.textContent).toContain("spotter123");
  });

  it("closes on Escape", async () => {
    await open(photo("a"));
    let closed = 0;
    fixture.componentInstance.close.subscribe(() => closed++);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(closed).toBe(1);
  });

  it("moves focus to the Close button on open", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const viewer = await open(photo("a"));

    expect(document.activeElement).toBe(viewer.querySelector('button[aria-label="Close"]'));
    opener.remove();
  });

  it("keeps Tab inside: leaving either edge wraps back to the Close button", async () => {
    const viewer = await open(photo("a"));
    const close = viewer.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    const anchors = viewer.querySelectorAll<HTMLElement>(".cdk-focus-trap-anchor");
    expect(anchors).toHaveLength(2);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    for (const anchor of Array.from(anchors)) {
      // What Tab / Shift+Tab does after the last / before the first tabbable element.
      outside.focus();
      anchor.focus();
      expect(document.activeElement).toBe(close);
    }
    outside.remove();
  });

  it("restores focus to the element that had it before opening, once destroyed", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    await open(photo("a"));
    expect(document.activeElement).not.toBe(opener);

    fixture.destroy();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

@Component({
  imports: [JustifiedGridComponent, MediaViewerComponent],
  template: `
    <app-justified-grid [items]="items" (imageClick)="selected.set($event)" />
    @if (selected(); as media) {
      <app-media-viewer [media]="media" (close)="selected.set(null)" />
    }
  `,
})
class GalleryHostComponent {
  readonly items = [photo("a"), photo("b")];
  readonly selected = signal<MediaNode | null>(null);
}

describe("MediaViewerComponent opened from a thumbnail", () => {
  it("returns focus to that thumbnail when it closes", async () => {
    const fixture = TestBed.createComponent(GalleryHostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const thumbnails = root.querySelectorAll<HTMLButtonElement>("app-justified-grid button");

    // A keyboard activation: the thumbnail has focus when the viewer opens.
    thumbnails[1].focus();
    thumbnails[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    const close = root.querySelector<HTMLButtonElement>(
      'app-media-viewer button[aria-label="Close"]',
    )!;
    expect(document.activeElement).toBe(close);

    close.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector("app-media-viewer")).toBeNull();
    expect(document.activeElement).toBe(thumbnails[1]);
  });
});

function pointerEvent(
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
): PointerEvent {
  return new PointerEvent(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
    pointerType: "touch",
    bubbles: true,
    ...init,
  });
}

describe("MediaViewerComponent navigation", () => {
  const a = photo("a");
  const b = photo("b");
  const c = photo("c");
  let fixture: ComponentFixture<MediaViewerComponent>;
  let went: MediaNode[];

  /** The viewer showing `b`, with `prev` and `next` as its neighbours. */
  async function openBetween(prev: MediaNode | null, next: MediaNode | null): Promise<HTMLElement> {
    fixture = TestBed.createComponent(MediaViewerComponent);
    fixture.componentRef.setInput("media", b);
    fixture.componentRef.setInput("prev", prev);
    fixture.componentRef.setInput("next", next);
    went = [];
    fixture.componentInstance.navigate.subscribe((media) => went.push(media));
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function control(viewer: HTMLElement, name: string): HTMLButtonElement {
    return viewer.querySelector<HTMLButtonElement>(`[data-testid="media-viewer-${name}"]`)!;
  }

  function keydown(key: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
  }

  /** A drag from (200, 100) by (dx, dy) on the photo, as one finger. */
  function swipe(viewer: HTMLElement, dx: number, dy = 0, init: PointerEventInit = {}): void {
    const stage = control(viewer, "stage");
    stage.dispatchEvent(pointerEvent("pointerdown", 200, 100, init));
    stage.dispatchEvent(pointerEvent("pointerup", 200 + dx, 100 + dy, init));
  }

  it("has no previous/next buttons when the host gave it no neighbours, as in the incident card", async () => {
    const viewer = await openBetween(null, null);

    expect(control(viewer, "prev")).toBeNull();
    expect(control(viewer, "next")).toBeNull();
  });

  it("goes to the next photo on ArrowRight and the previous one on ArrowLeft", async () => {
    await openBetween(a, c);

    keydown("ArrowRight");
    keydown("ArrowLeft");

    expect(went).toEqual([c, a]);
  });

  it("does nothing on an arrow key at either end of the list", async () => {
    await openBetween(null, null);
    keydown("ArrowRight");
    keydown("ArrowLeft");
    expect(went).toEqual([]);

    await openBetween(null, c);
    keydown("ArrowLeft");
    expect(went).toEqual([]);
    keydown("ArrowRight");
    expect(went).toEqual([c]);
  });

  it("leaves Alt+Arrow (the browser's Back and Forward) alone", async () => {
    await openBetween(a, c);

    keydown("ArrowLeft", { altKey: true });
    keydown("ArrowRight", { metaKey: true });

    expect(went).toEqual([]);
  });

  it("still closes on Escape with navigation on", async () => {
    await openBetween(a, c);
    let closed = 0;
    fixture.componentInstance.close.subscribe(() => closed++);

    keydown("Escape");

    expect(closed).toBe(1);
    expect(went).toEqual([]);
  });

  it("has named previous/next buttons that go to those photos", async () => {
    const viewer = await openBetween(a, c);

    expect(control(viewer, "prev").getAttribute("aria-label")).toBe("Previous photo");
    expect(control(viewer, "next").getAttribute("aria-label")).toBe("Next photo");
    control(viewer, "next").click();
    control(viewer, "prev").click();

    expect(went).toEqual([c, a]);
  });

  it("does not close the viewer when a navigation button is clicked", async () => {
    const viewer = await openBetween(a, c);
    let closed = 0;
    fixture.componentInstance.close.subscribe(() => closed++);

    control(viewer, "next").click();

    expect(closed).toBe(0);
  });

  it("keeps a button at the end of the list, aria-disabled and inert", async () => {
    const viewer = await openBetween(null, c);

    const prev = control(viewer, "prev");
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    expect(control(viewer, "next").getAttribute("aria-disabled")).toBe("false");
    // Not `disabled`: that would take it out of the tab order and drop focus from it.
    expect(prev.disabled).toBe(false);
    prev.click();
    expect(went).toEqual([]);
  });

  it("keeps focus on the Next button when it runs out of photos, so focus stays in the dialog", async () => {
    const viewer = await openBetween(a, c);
    const next = control(viewer, "next");
    next.focus();
    expect(document.activeElement).toBe(next);

    // The host moved on to the last photo.
    fixture.componentRef.setInput("next", null);
    fixture.detectChanges();

    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(next);
  });

  it("shows the photo the host switches it to", async () => {
    const viewer = await openBetween(a, c);

    fixture.componentRef.setInput("media", c);
    fixture.detectChanges();

    expect(viewer.querySelector("img")!.getAttribute("src")).toBe(c.file!.url);
  });

  describe("swipe", () => {
    it("goes to the next photo on a swipe left and the previous one on a swipe right", async () => {
      const viewer = await openBetween(a, c);

      swipe(viewer, -80);
      swipe(viewer, 80);

      expect(went).toEqual([c, a]);
    });

    it("needs at least 50 px", async () => {
      const viewer = await openBetween(a, c);

      swipe(viewer, -49);
      swipe(viewer, 49);
      expect(went).toEqual([]);

      swipe(viewer, -50);
      swipe(viewer, 50);
      expect(went).toEqual([c, a]);
    });

    it("ignores a drag that is more up and down than sideways", async () => {
      const viewer = await openBetween(a, c);

      swipe(viewer, -60, 90);
      swipe(viewer, 60, -60); // equal is not "larger"
      swipe(viewer, -60, 0); // control: sideways alone does go

      expect(went).toEqual([c]);
    });

    it("does nothing past the end of the list", async () => {
      const viewer = await openBetween(null, c);

      swipe(viewer, 80);
      expect(went).toEqual([]);
      swipe(viewer, -80);
      expect(went).toEqual([c]);
    });

    it("works with a pen and ignores a mouse", async () => {
      const viewer = await openBetween(a, c);

      swipe(viewer, -80, 0, { pointerType: "mouse" });
      expect(went).toEqual([]);
      swipe(viewer, -80, 0, { pointerType: "pen" });
      expect(went).toEqual([c]);
    });

    it("is called off by a second finger", async () => {
      const viewer = await openBetween(a, c);
      const stage = control(viewer, "stage");

      stage.dispatchEvent(pointerEvent("pointerdown", 200, 100));
      stage.dispatchEvent(
        pointerEvent("pointerdown", 260, 100, { pointerId: 2, isPrimary: false }),
      );
      stage.dispatchEvent(pointerEvent("pointerup", 100, 100));

      expect(went).toEqual([]);
    });

    it("is called off when the browser takes the pointer over for a scroll", async () => {
      const viewer = await openBetween(a, c);
      const stage = control(viewer, "stage");

      stage.dispatchEvent(pointerEvent("pointerdown", 200, 100));
      stage.dispatchEvent(pointerEvent("pointercancel", 200, 100));
      stage.dispatchEvent(pointerEvent("pointerup", 100, 100));

      expect(went).toEqual([]);
    });

    it("does not count a release it never saw the press of", async () => {
      const viewer = await openBetween(a, c);

      control(viewer, "stage").dispatchEvent(pointerEvent("pointerup", 20, 100));

      expect(went).toEqual([]);
    });

    it("leaves the browser its vertical scroll and pinch zoom, and takes only the sideways drag", async () => {
      const viewer = await openBetween(a, c);

      const classes = control(viewer, "stage").classList;
      expect(classes.contains("touch-pan-y")).toBe(true);
      expect(classes.contains("touch-pinch-zoom")).toBe(true);
    });
  });
});
