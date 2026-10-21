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
