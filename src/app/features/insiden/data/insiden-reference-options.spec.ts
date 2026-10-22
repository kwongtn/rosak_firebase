import { signal } from "@angular/core";
import { describe, expect, it } from "vitest";

import type { AssetMultiSelectOption } from "../asset-multi-select/asset-multi-select.component";
import type { InsidenReferenceQueryData } from "./insiden.queries";
import {
  defaultCategoryId,
  injectDefaultCategory,
  vehicleOptionsFor,
} from "./insiden-reference-options";

function line(
  id: string,
  code: string,
  vehicles: string[],
): InsidenReferenceQueryData["lines"][number] {
  return {
    id,
    code,
    displayName: `${code} Line`,
    vehicleTypes: [
      {
        id: `${id}-type`,
        displayName: "Train",
        vehicles: vehicles.map((no) => ({ id: no, identificationNo: no })),
      },
    ],
  };
}

// V2 runs on both lines, so it carries both codes.
const LINES = [line("1", "KJL", ["V1", "V2"]), line("2", "AGL", ["V2", "V3"])];

const ids = (options: AssetMultiSelectOption[]) => options.map((option) => option.id);

describe("vehicleOptionsFor", () => {
  it("lists every vehicle once, with all its line codes, when no line is selected", () => {
    const options = vehicleOptionsFor(LINES, [], []);

    expect(ids(options)).toEqual(["V1", "V2", "V3"]);
    expect(options.find((option) => option.id === "V2")?.parentCodes).toEqual(["KJL", "AGL"]);
  });

  it("lists only the selected line's vehicles", () => {
    expect(ids(vehicleOptionsFor(LINES, ["2"], []))).toEqual(["V2", "V3"]);
  });

  it("keeps a selected vehicle whose line is not selected listed, so it can be seen and removed", () => {
    // An edit of a link tagged V1 without its line, or KJL unticked after V1 was picked: hidden, V1
    // would still be selected and still sent with the next save.
    const options = vehicleOptionsFor(LINES, ["2"], ["V1"]);

    expect(ids(options)).toContain("V1");
    expect(ids(options)).toEqual(["V2", "V3", "V1"]);
  });

  it("ignores ids that match no loaded line or vehicle", () => {
    expect(ids(vehicleOptionsFor(LINES, ["9"], ["V9"]))).toEqual([]);
    expect(vehicleOptionsFor([], ["1"], ["V1"])).toEqual([]);
  });
});

describe("defaultCategoryId", () => {
  it("finds Just Reporting, and nothing before the categories load", () => {
    expect(
      defaultCategoryId([
        { id: "C2", label: "Signal fault" },
        { id: "C1", label: "Just Reporting" },
      ]),
    ).toBe("C1");
    expect(defaultCategoryId([])).toBeNull();
  });
});

describe("injectDefaultCategory", () => {
  const CATEGORIES = [
    { id: "C1", label: "Just Reporting" },
    { id: "C2", label: "Signal fault" },
  ];

  it("starts a new submission on Just Reporting once the categories load", () => {
    const options = signal<AssetMultiSelectOption[]>([]);
    const category = injectDefaultCategory(options, signal(false));
    expect(category()).toBeNull();

    options.set(CATEGORIES);

    expect(category()).toBe("C1");
  });

  it("keeps the rider's pick when the category list is rebuilt with the same default", () => {
    const options = signal<AssetMultiSelectOption[]>(CATEGORIES);
    const category = injectDefaultCategory(options, signal(false));
    category.set("C2");

    options.set([...CATEGORIES]);

    expect(category()).toBe("C2");
  });

  it("proposes nothing while editing, and keeps the category the edit hydrated", () => {
    const options = signal<AssetMultiSelectOption[]>([]);
    const isEditing = signal(true);
    const category = injectDefaultCategory(options, isEditing);
    expect(category()).toBeNull();
    category.set("C2");

    // The read answering after the hydration must not replace the row's own category.
    options.set(CATEGORIES);
    expect(category()).toBe("C2");

    // Leaving edit mode starts the next submission on the default again.
    isEditing.set(false);
    expect(category()).toBe("C1");
  });
});
