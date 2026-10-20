import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { AvatarComponent, initialsOf } from "./avatar";

describe("initialsOf", () => {
  it("takes the first letter of the first and last words, uppercased", () => {
    expect(initialsOf("Ann Lee")).toBe("AL");
    expect(initialsOf("mary jane watson")).toBe("MW");
    expect(initialsOf("  Ahmad   bin   Ali ")).toBe("AA");
  });

  it("uses a single letter for a single word", () => {
    expect(initialsOf("Zul")).toBe("Z");
  });

  it("does not split a multi-unit first character", () => {
    expect(initialsOf("😀 Smile")).toBe("😀S");
    expect(initialsOf("陈 大文")).toBe("陈大");
  });

  it("falls back to a placeholder for a blank or missing name", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
    expect(initialsOf(undefined)).toBe("?");
    expect(initialsOf(null)).toBe("?");
  });
});

describe("AvatarComponent", () => {
  let fixture: ComponentFixture<AvatarComponent>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AvatarComponent);
    root = fixture.nativeElement as HTMLElement;
  });

  function render(inputs: { name?: string; src?: string; size?: number }): void {
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
  }

  it("renders the image, sized, when src is set", () => {
    render({ name: "Ann Lee", src: "https://example.test/ann.png", size: 48 });

    const img = root.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.test/ann.png");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("width")).toBe("48");
    expect(root.querySelector('[data-testid="avatar-initials"]')).toBeNull();
  });

  it("shows initials when there is no src", () => {
    render({ name: "Ann Lee", src: "" });

    expect(root.querySelector("img")).toBeNull();
    const badge = root.querySelector('[data-testid="avatar-initials"]');
    expect(badge?.textContent?.trim()).toBe("AL");
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
  });

  it("falls back to initials when the image fails, and retries a new src", () => {
    render({ name: "Ann Lee", src: "https://example.test/broken.png" });
    root.querySelector("img")?.dispatchEvent(new Event("error"));
    fixture.detectChanges();

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector('[data-testid="avatar-initials"]')?.textContent?.trim()).toBe("AL");

    fixture.componentRef.setInput("src", "https://example.test/fixed.png");
    fixture.detectChanges();

    expect(root.querySelector("img")?.getAttribute("src")).toBe("https://example.test/fixed.png");
  });
});
