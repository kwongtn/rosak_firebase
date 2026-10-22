import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { ScrollLock } from "./scroll-lock";

const overflow = (): string[] => [
  document.body.style.overflow,
  document.documentElement.style.overflow,
];

describe("ScrollLock", () => {
  afterEach(() => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  });

  it("locks on the first acquire and unlocks on the last release", () => {
    const lock = TestBed.inject(ScrollLock);

    lock.acquire();
    lock.acquire();
    expect(overflow()).toEqual(["hidden", "hidden"]);

    lock.release();
    expect(overflow()).toEqual(["hidden", "hidden"]);

    lock.release();
    expect(overflow()).toEqual(["", ""]);
  });

  it("ignores a release without an acquire, so the next acquire still locks", () => {
    const lock = TestBed.inject(ScrollLock);

    lock.release();
    lock.acquire();

    expect(overflow()).toEqual(["hidden", "hidden"]);
  });

  it("does not touch the document on the server", () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: "server" }] });
    const lock = TestBed.inject(ScrollLock);

    lock.acquire();

    expect(overflow()).toEqual(["", ""]);
  });
});
