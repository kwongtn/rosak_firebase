import { PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeService } from "./theme.service";

/** A `matchMedia` for "(prefers-color-scheme: dark)" whose answer a test can flip at any time. */
function stubSystemTheme(prefersDark: boolean) {
  const listeners: ((event: { matches: boolean }) => void)[] = [];
  const query = {
    matches: prefersDark,
    addEventListener: (_type: "change", listener: (event: { matches: boolean }) => void) =>
      listeners.push(listener),
  };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    /** The OS theme changes while the page is open. */
    flipTo: (dark: boolean) => listeners.forEach((listener) => listener({ matches: dark })),
  };
}

describe("ThemeService", () => {
  const isDark = () => document.documentElement.classList.contains("dark");

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.removeItem("theme");
    document.documentElement.classList.remove("dark");
  });

  function create(): ThemeService {
    const service = TestBed.inject(ThemeService);
    // The effect that paints the `dark` class runs with the next change-detection pass.
    TestBed.tick();
    return service;
  }

  it("follows the OS preference by default, and paints it", () => {
    stubSystemTheme(true);

    const service = create();

    expect(service.mode()).toBe("system");
    expect(service.resolvedTheme()).toBe("dark");
    expect(isDark()).toBe(true);
  });

  it("is light when the OS prefers light", () => {
    stubSystemTheme(false);

    const service = create();

    expect(service.resolvedTheme()).toBe("light");
    expect(isDark()).toBe(false);
  });

  it.each(["light", "dark", "system"] as const)("restores the stored mode %s", (stored) => {
    stubSystemTheme(false);
    localStorage.setItem("theme", stored);

    expect(create().mode()).toBe(stored);
  });

  it("ignores a stored value that is not a mode", () => {
    stubSystemTheme(false);
    localStorage.setItem("theme", "sepia");

    expect(create().mode()).toBe("system");
  });

  it("lets a stored mode win over the OS preference", () => {
    stubSystemTheme(true);
    localStorage.setItem("theme", "light");

    const service = create();

    expect(service.resolvedTheme()).toBe("light");
    expect(isDark()).toBe(false);
  });

  it("cycles light, dark, system and back, and stores each choice", () => {
    stubSystemTheme(false);
    localStorage.setItem("theme", "light");
    const service = create();
    const seen: string[] = [];

    for (let i = 0; i < 4; i++) {
      service.cycle();
      seen.push(`${service.mode()}:${localStorage.getItem("theme")}`);
    }

    expect(seen).toEqual(["dark:dark", "system:system", "light:light", "dark:dark"]);
  });

  it("repaints when the mode changes", () => {
    stubSystemTheme(false);
    localStorage.setItem("theme", "light");
    const service = create();

    service.cycle(); // dark
    TestBed.tick();
    expect(isDark()).toBe(true);

    service.cycle(); // system, which the OS says is light
    TestBed.tick();
    expect(isDark()).toBe(false);
  });

  it("tracks the OS live while the mode is system, and not otherwise", () => {
    const system = stubSystemTheme(false);
    const service = create();

    system.flipTo(true);
    TestBed.tick();
    expect(service.resolvedTheme()).toBe("dark");
    expect(isDark()).toBe(true);

    service.mode.set("light");
    system.flipTo(false);
    system.flipTo(true);
    TestBed.tick();
    expect(service.resolvedTheme()).toBe("light");
    expect(isDark()).toBe(false);
  });

  describe("on the server", () => {
    it("touches neither storage, nor matchMedia, nor the document", () => {
      const system = stubSystemTheme(true);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: "server" }],
      });
      const getItem = vi.spyOn(Storage.prototype, "getItem");
      const setItem = vi.spyOn(Storage.prototype, "setItem");

      const service = create();
      service.cycle();

      expect(system.matchMedia).not.toHaveBeenCalled();
      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(isDark()).toBe(false);
      expect(service.mode()).toBe("light");
    });
  });
});
