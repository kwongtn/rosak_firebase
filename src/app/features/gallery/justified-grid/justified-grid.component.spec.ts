import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { MediaNode } from "../data/gallery.queries";
import { JustifiedGridComponent, TARGET_ROW_HEIGHT } from "./justified-grid.component";

function photo(id: string, width: number, height: number, nickname = "spotter123"): MediaNode {
  return {
    id,
    createdDate: "2024-05-12",
    width,
    height,
    file: { url: `https://i.imgur.com/${id}.jpg` },
    uploader: { nickname },
  };
}

describe("JustifiedGridComponent", () => {
  let fixture: ComponentFixture<JustifiedGridComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [JustifiedGridComponent] }).compileComponents();
    fixture = TestBed.createComponent(JustifiedGridComponent);
  });

  function render(items: MediaNode[], eagerCount?: number): HTMLElement {
    fixture.componentRef.setInput("items", items);
    if (eagerCount !== undefined) {
      fixture.componentRef.setInput("eagerCount", eagerCount);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function tiles(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>("div.relative"));
  }

  function images(root: HTMLElement): HTMLImageElement[] {
    return Array.from(root.querySelectorAll("img"));
  }

  it("renders every photo on the first pass, with no measured container width", () => {
    // jsdom lays nothing out (clientWidth is 0), exactly the width the server sees: markup that
    // depended on a measured width would render no images here, as the old grid did on the server.
    const root = render([photo("a", 400, 300), photo("b", 300, 400), photo("c", 100, 100)]);

    expect(images(root).map((img) => img.getAttribute("src"))).toEqual([
      "https://i.imgur.com/am.jpg",
      "https://i.imgur.com/bm.jpg",
      "https://i.imgur.com/cm.jpg",
    ]);
  });

  it("sizes each tile by its aspect ratio so the browser can justify the rows", () => {
    const root = render([
      photo("wide", 400, 200),
      photo("tall", 100, 200),
      photo("square", 50, 50),
    ]);

    const [wide, tall, square] = tiles(root);
    expect(wide.style.flexGrow).toBe("200");
    expect(wide.style.flexBasis).toBe(`${2 * TARGET_ROW_HEIGHT}px`);
    expect(tall.style.flexGrow).toBe("50");
    expect(tall.style.flexBasis).toBe(`${0.5 * TARGET_ROW_HEIGHT}px`);
    expect(square.style.flexGrow).toBe("100");
    expect(square.style.flexBasis).toBe(`${TARGET_ROW_HEIGHT}px`);
  });

  it("reserves each tile's height with a padding box that the image fills", () => {
    const root = render([photo("wide", 400, 200)]);

    const [tile] = tiles(root);
    expect((tile.firstElementChild as HTMLElement).style.paddingBottom).toBe("50%");
    const button = tile.querySelector("button")!;
    expect(button.classList.contains("absolute")).toBe(true);
    expect(button.classList.contains("inset-0")).toBe(true);
    expect(button.querySelector("img")!.classList.contains("object-cover")).toBe(true);
  });

  it("assumes a 4:3 photo when width or height is missing", () => {
    const root = render([photo("zero", 0, 0), photo("no-height", 500, 0)]);

    for (const tile of tiles(root)) {
      expect(Number(tile.style.flexGrow)).toBeCloseTo((4 / 3) * 100);
      expect(Number.parseFloat(tile.style.flexBasis)).toBeCloseTo((4 / 3) * TARGET_ROW_HEIGHT);
      expect(
        Number.parseFloat((tile.firstElementChild as HTMLElement).style.paddingBottom),
      ).toBeCloseTo(75);
    }
  });

  it("ends with a spacer that out-grows every tile, so the last row is not stretched", () => {
    const root = render([photo("a", 400, 300), photo("b", 300, 400)]);

    const container = root.querySelector("div.flex-wrap")!;
    const spacer = container.lastElementChild as HTMLElement;
    expect(spacer.classList.contains("grow-[1000000]")).toBe(true);
    expect(spacer.children).toHaveLength(0);
    expect(container.children).toHaveLength(3);
  });

  it("keeps the 6px gap between tiles", () => {
    const root = render([photo("a", 400, 300)]);

    expect((root.querySelector("div.flex-wrap") as HTMLElement).style.gap).toBe("6px");
  });

  it("emits the photo when its tile is clicked", () => {
    const first = photo("a", 400, 300);
    const second = photo("b", 300, 400);
    const root = render([first, second]);
    const clicked: MediaNode[] = [];
    fixture.componentInstance.imageClick.subscribe((media) => clicked.push(media));

    root.querySelectorAll("button")[1].click();

    expect(clicked).toEqual([second]);
  });

  it("lazy-loads every photo unless told which ones sit at the top of the page", () => {
    const root = render([photo("a", 400, 300), photo("b", 400, 300)]);

    for (const img of images(root)) {
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.hasAttribute("fetchpriority")).toBe(false);
    }
  });

  it("eager-loads the first eagerCount photos, the very first at high priority", () => {
    const root = render(
      Array.from({ length: 6 }, (_, i) => photo(`p${i}`, 400, 300)),
      4,
    );

    const imgs = images(root);
    expect(imgs.map((img) => img.getAttribute("loading"))).toEqual([
      "eager",
      "eager",
      "eager",
      "eager",
      "lazy",
      "lazy",
    ]);
    expect(imgs.map((img) => img.getAttribute("fetchpriority"))).toEqual([
      "high",
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("swaps a thumbnail that fails to load for the placeholder, and uses it for a missing file", () => {
    const missing = { ...photo("gone", 400, 300), file: null };
    const root = render([photo("a", 400, 300), missing]);

    const [first, second] = images(root);
    expect(second.getAttribute("src")).toBe("/image-not-found.png");
    first.dispatchEvent(new Event("error"));
    fixture.detectChanges();
    expect(first.getAttribute("src")).toBe("/image-not-found.png");
  });
});
