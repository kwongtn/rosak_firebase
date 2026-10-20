import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicAboutDocument } from "../data/about.model";
import { AboutEditorComponent } from "./about-editor.component";

const DOC: PublicAboutDocument = {
  aboutProject: "We build transit tools.",
  projects: [
    {
      name: "Alpha",
      description: "First project",
      startDate: "2024-01",
      display: true,
      status: "beta",
    },
    {
      name: "Beta",
      description: "Second project",
      startDate: "2023-05",
      display: true,
      status: "stable",
    },
  ],
  personnel: [],
  techStacks: [],
  communityProjects: [],
};

const OTHER_DOC: PublicAboutDocument = {
  ...DOC,
  aboutProject: "A remote change.",
  projects: [{ ...DOC.projects[0], name: "Remote" }],
};

describe("AboutEditorComponent", () => {
  let fixture: ComponentFixture<AboutEditorComponent>;
  let root: HTMLElement;

  function detect(): void {
    fixture.detectChanges();
  }

  function buttonWithText(text: string): HTMLButtonElement {
    const match = [...root.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").replace(/\s+/g, " ").trim() === text,
    );
    if (!match) throw new Error(`button "${text}" not rendered`);
    return match;
  }

  /** The Name input of the project card at `index` (cards are in document order). */
  function projectNameInput(index: number): HTMLInputElement {
    const startInputs = root.querySelectorAll<HTMLInputElement>(
      'input[placeholder="Start date (YYYY-MM-DD)"]',
    );
    const card = startInputs[index]?.parentElement;
    const input = card?.querySelector<HTMLInputElement>('input[placeholder="Name"]');
    if (!input) throw new Error(`project name input ${index} not rendered`);
    return input;
  }

  function typeInto(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  }

  function projectCardCount(): number {
    return root.querySelectorAll('input[placeholder="Start date (YYYY-MM-DD)"]').length;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  function create(options: { initial?: PublicAboutDocument; saving?: boolean } = {}): {
    submitted: ReturnType<typeof vi.fn>;
    dismissed: ReturnType<typeof vi.fn>;
  } {
    fixture = TestBed.createComponent(AboutEditorComponent);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput("initial", options.initial);
    fixture.componentRef.setInput("saving", options.saving ?? false);
    const submitted = vi.fn();
    const dismissed = vi.fn();
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.dismissed.subscribe(dismissed);
    detect();
    return { submitted, dismissed };
  }

  it("renders the draft from `initial`", () => {
    create({ initial: DOC });

    expect(projectNameInput(0).value).toBe("Alpha");
    expect(projectNameInput(1).value).toBe("Beta");
    const about = root.querySelector<HTMLTextAreaElement>("#about-project-input");
    expect(about?.value).toBe("We build transit tools.");
  });

  it("renders an empty draft when there is no doc yet", () => {
    create({ initial: undefined });

    expect(root.querySelector("h2")?.textContent?.trim()).toBe("Edit about page");
    expect(projectCardCount()).toBe(0);
    expect(root.querySelector<HTMLTextAreaElement>("#about-project-input")?.value).toBe("");
  });

  it("emits the edited doc on Save", () => {
    const { submitted } = create({ initial: DOC });

    typeInto(projectNameInput(0), "Renamed");
    detect();
    buttonWithText("Save").click();

    expect(submitted).toHaveBeenCalledTimes(1);
    const emitted = submitted.mock.calls[0][0] as PublicAboutDocument;
    expect(emitted.projects[0].name).toBe("Renamed");
  });

  it("drops a nameless added project on Save, but keeps a named one", () => {
    const { submitted } = create({ initial: DOC });

    buttonWithText("Add project").click();
    detect();
    expect(projectCardCount()).toBe(3);

    buttonWithText("Save").click();
    expect((submitted.mock.calls[0][0] as PublicAboutDocument).projects).toHaveLength(2);

    typeInto(projectNameInput(2), "Gamma");
    detect();
    buttonWithText("Save").click();
    expect((submitted.mock.calls[1][0] as PublicAboutDocument).projects).toHaveLength(3);
  });

  it("removes a project from the emitted doc", () => {
    const { submitted } = create({ initial: DOC });

    // Projects render first in the DOM, so the first "Remove" belongs to the first project card.
    const firstRemove = [...root.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Remove",
    );
    if (!firstRemove) throw new Error("Remove button not rendered");
    firstRemove.click();
    detect();
    buttonWithText("Save").click();

    const emitted = submitted.mock.calls[0][0] as PublicAboutDocument;
    expect(emitted.projects.map((p) => p.name)).toEqual(["Beta"]);
  });

  it("emits dismissed once and never submitted on Cancel", () => {
    const { submitted, dismissed } = create({ initial: DOC });

    buttonWithText("Cancel").click();

    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
  });

  it("disables both buttons and blocks Save while saving", () => {
    const { submitted } = create({ initial: DOC, saving: true });

    const save = buttonWithText("Saving…");
    expect(save.disabled).toBe(true);
    expect(buttonWithText("Cancel").disabled).toBe(true);

    save.click();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("does not overwrite the open draft when `initial` changes later", () => {
    create({ initial: DOC });

    fixture.componentRef.setInput("initial", OTHER_DOC);
    detect();

    expect(projectNameInput(0).value).toBe("Alpha");
    expect(root.querySelector<HTMLTextAreaElement>("#about-project-input")?.value).toBe(
      "We build transit tools.",
    );
  });
});
