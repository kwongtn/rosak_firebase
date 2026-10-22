import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type ChronologyDraft } from "../../../insiden/incident-form/chronology-list.util";
import {
  PendingChronologyEditorComponent,
  type ChronologyPatch,
} from "./pending-chronology-editor.component";

const DRAFT: ChronologyDraft = {
  key: 7,
  indicator: "GREEN",
  datetime: "2026-08-01T08:30",
  sourceUrl: "https://x.com/halt",
  content: "typed by hand",
  collapsed: false,
};

describe("PendingChronologyEditorComponent", () => {
  let fixture: ComponentFixture<PendingChronologyEditorComponent>;
  let root: HTMLElement;
  let patches: ChronologyPatch[];
  let draft: ChronologyDraft;

  beforeEach(() => {
    draft = { ...DRAFT };
    patches = [];
    fixture = TestBed.createComponent(PendingChronologyEditorComponent);
    fixture.componentRef.setInput("chronologies", [draft]);
    fixture.componentRef.setInput("extractStates", new Map());
    fixture.componentRef.setInput("isSummarizing", false);
    fixture.componentInstance.patch.subscribe((p) => patches.push(p));
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  function edit(selector: string, value: string, event: "input" | "change"): void {
    const control = root.querySelector<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>(
      selector,
    );
    if (!control) throw new Error(`${selector} not rendered`);
    control.value = value;
    control.dispatchEvent(new Event(event, { bubbles: true }));
  }

  it("emits one patch per edited field, keyed by the draft", () => {
    edit("select", "RED", "change");
    edit("input[type='datetime-local']", "2026-08-02T09:00", "change");
    edit("input[type='url']", "https://x.com/other", "change");
    edit("textarea", "edited", "input");

    expect(patches).toEqual([
      { key: 7, field: "indicator", value: "RED" },
      { key: 7, field: "datetime", value: "2026-08-02T09:00" },
      { key: 7, field: "sourceUrl", value: "https://x.com/other" },
      { key: 7, field: "content", value: "edited" },
    ]);
  });

  it("reports the textarea on every keystroke (input), not only when it loses focus (change)", () => {
    const textarea = root.querySelector("textarea");
    textarea?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(patches).toEqual([]);

    edit("textarea", "a", "input");
    edit("textarea", "ab", "input");
    expect(patches.map((p) => p.value)).toEqual(["a", "ab"]);
  });

  it("never writes into the draft it was given", () => {
    const spy = vi.fn();
    fixture.componentInstance.patch.subscribe(spy);
    edit("textarea", "edited", "input");
    edit("select", "BLUE", "change");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(draft).toEqual(DRAFT);
  });
});
