import { describe, expect, it } from "vitest";
import {
  NAV_LINKS,
  avatarButtonClassFor,
  avatarLabelText,
  moduleLabelFor,
  newVersionButtonClassFor,
  welcomeLabelText,
  wordmarkClassFor,
} from "./app-nav.util";

describe("moduleLabelFor", () => {
  it("names each module link from its segment", () => {
    expect(moduleLabelFor("")).toBe("Home");
    expect(moduleLabelFor("spotting")).toBe("TranSPOT");
    expect(moduleLabelFor("tracker")).toBe("Tracker");
    expect(moduleLabelFor("gallery")).toBe("Gallery");
    expect(moduleLabelFor("insiden")).toBe("Insiden");
    expect(moduleLabelFor("about")).toBe("About");
  });

  it("names the two non-nav routes that still have a label", () => {
    expect(moduleLabelFor("profile")).toBe("Profile");
    expect(moduleLabelFor("console")).toBe("Console");
  });

  it("falls back to Menu for an unknown segment", () => {
    expect(moduleLabelFor("nonexistent")).toBe("Menu");
  });

  it("keeps every NAV_LINKS path represented", () => {
    for (const link of NAV_LINKS) {
      expect(moduleLabelFor(link.path.slice(1))).toBe(link.label);
    }
  });
});

describe("class helpers", () => {
  it("wordmarkClassFor appends the wipe-in only when animating", () => {
    expect(wordmarkClassFor(false)).toBe("text-lg font-semibold whitespace-nowrap");
    expect(wordmarkClassFor(true)).toBe(
      "text-lg font-semibold whitespace-nowrap animate-wordmark-wipe",
    );
  });

  it("newVersionButtonClassFor picks the expanded vs square width", () => {
    expect(newVersionButtonClassFor(true)).toBe("w-44 px-3");
    expect(newVersionButtonClassFor(false)).toBe("w-8 px-0 justify-center");
  });

  it("avatarButtonClassFor is empty unless expanded", () => {
    expect(avatarButtonClassFor(false)).toBe("");
    expect(avatarButtonClassFor(true)).toBe("border-primary text-primary");
  });
});

describe("avatar labels", () => {
  it("welcomeLabelText wraps the name", () => {
    expect(welcomeLabelText("Aisyah")).toBe("Welcome back, Aisyah");
  });

  it("avatarLabelText is Log In logged out", () => {
    expect(
      avatarLabelText({ isLoggedIn: false, showHint: true, welcomeLabel: "x", name: "Aisyah" }),
    ).toBe("Log In");
  });

  it("avatarLabelText greets while the hint shows, else the bare name", () => {
    const base = { isLoggedIn: true, welcomeLabel: "Welcome back, Aisyah", name: "Aisyah" };
    expect(avatarLabelText({ ...base, showHint: true })).toBe("Welcome back, Aisyah");
    expect(avatarLabelText({ ...base, showHint: false })).toBe("Aisyah");
  });
});
