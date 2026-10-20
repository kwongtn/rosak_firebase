import { Component, OnInit, input, output, signal } from "@angular/core";
import { HlmButton } from "../../../ui/button/button";
import { HlmCardImports } from "../../../ui/card/card";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { HlmInput } from "../../../ui/input/input";
import { HlmNativeSelect } from "../../../ui/select/native-select";
import {
  CommunityProject,
  Personnel,
  PersonnelSocial,
  Project,
  PublicAboutDocument,
  TechStack,
} from "../data/about.model";
import {
  draftFromDoc,
  emptyCommunityProject,
  emptyPersonnel,
  emptyProject,
  emptySocial,
  emptyTechStack,
  sanitizeDraft,
} from "../data/about-edit.util";

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Admin form for the `public/about` doc. Purely a form: it owns the draft and emits the sanitized
 * result, while the page owns persistence (`setDoc`), the `saving` flag and closing. Loaded with
 * `@defer` so visitors who are not editing never download it.
 */
@Component({
  selector: "app-about-editor",
  imports: [HlmButton, HlmCheckbox, HlmInput, HlmNativeSelect, ...HlmCardImports],
  templateUrl: "./about-editor.component.html",
})
export class AboutEditorComponent implements OnInit {
  /**
   * The published snapshot the draft starts from, read once on init: a later remote snapshot does
   * not overwrite an open draft. `undefined` (no doc yet) starts from an empty draft.
   */
  readonly initial = input<PublicAboutDocument | undefined>();
  /** A save is in flight: both buttons are disabled and Save reads "Saving…". */
  readonly saving = input(false);
  /** Save pressed; carries the sanitized doc, ready for Firestore. */
  readonly submitted = output<PublicAboutDocument>();
  readonly dismissed = output<void>();

  private readonly _draft = signal<PublicAboutDocument | undefined>(undefined);
  protected readonly draft = this._draft.asReadonly();

  ngOnInit(): void {
    this._draft.set(draftFromDoc(this.initial() ?? ({} as PublicAboutDocument)));
  }

  protected submit(): void {
    const draft = this._draft();
    if (!draft || this.saving()) {
      return;
    }
    this.submitted.emit(sanitizeDraft(draft));
  }

  /** The current value of the control that fired `event`; templates cannot cast. */
  protected valueOf(event: Event): string {
    return (event.target as FormControl).value;
  }

  /** `valueOf` for number inputs. */
  protected numberOf(event: Event): number {
    return Number(this.valueOf(event));
  }

  protected patchDraft(patch: Partial<PublicAboutDocument>): void {
    this._draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  private updateIn<K extends keyof PublicAboutDocument>(
    key: K,
    updater: (list: PublicAboutDocument[K]) => PublicAboutDocument[K],
  ): void {
    this._draft.update((d) => (d ? { ...d, [key]: updater(d[key]) } : d));
  }

  private updateItem<T>(list: T[], index: number, patch: Partial<T>): T[] {
    return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
  }

  protected updateProject(
    index: number,
    key: keyof Project,
    value: boolean | string | number,
  ): void {
    this.updateIn("projects", (list) =>
      this.updateItem(list as Project[], index, { [key]: value }),
    );
  }

  protected addProject(): void {
    this.updateIn("projects", (list) => [...(list as Project[]), emptyProject()]);
  }

  protected removeProject(index: number): void {
    this.updateIn("projects", (list) => (list as Project[]).filter((_, i) => i !== index));
  }

  protected updatePersonnel(
    index: number,
    key: keyof Personnel,
    value: boolean | string | number,
  ): void {
    this.updateIn("personnel", (list) =>
      this.updateItem(list as Personnel[], index, { [key]: value }),
    );
  }

  protected addPersonnel(): void {
    this.updateIn("personnel", (list) => {
      const items = list as Personnel[];
      return [...items, emptyPersonnel(items.length)];
    });
  }

  protected removePersonnel(index: number): void {
    this.updateIn("personnel", (list) => (list as Personnel[]).filter((_, i) => i !== index));
  }

  protected updateSocial(
    personIndex: number,
    socialIndex: number,
    key: keyof PersonnelSocial,
    value: string,
  ): void {
    this.updateIn("personnel", (list) =>
      (list as Personnel[]).map((p, i) =>
        i === personIndex
          ? { ...p, socials: this.updateItem(p.socials ?? [], socialIndex, { [key]: value }) }
          : p,
      ),
    );
  }

  protected addSocial(personIndex: number): void {
    this.updateIn("personnel", (list) =>
      (list as Personnel[]).map((p, i) =>
        i === personIndex ? { ...p, socials: [...(p.socials ?? []), emptySocial()] } : p,
      ),
    );
  }

  protected removeSocial(personIndex: number, socialIndex: number): void {
    this.updateIn("personnel", (list) =>
      (list as Personnel[]).map((p, i) =>
        i === personIndex
          ? { ...p, socials: (p.socials ?? []).filter((_, j) => j !== socialIndex) }
          : p,
      ),
    );
  }

  protected updateTechStack(index: number, key: keyof TechStack, value: string): void {
    this.updateIn("techStacks", (list) =>
      this.updateItem(list as TechStack[], index, { [key]: value }),
    );
  }

  protected addTechStack(): void {
    this.updateIn("techStacks", (list) => [...(list as TechStack[]), emptyTechStack()]);
  }

  protected removeTechStack(index: number): void {
    this.updateIn("techStacks", (list) => (list as TechStack[]).filter((_, i) => i !== index));
  }

  protected updateCommunityProject(
    index: number,
    key: keyof CommunityProject,
    value: string,
  ): void {
    this.updateIn("communityProjects", (list) =>
      this.updateItem(list as CommunityProject[], index, { [key]: value }),
    );
  }

  protected addCommunityProject(): void {
    this.updateIn("communityProjects", (list) => [
      ...(list as CommunityProject[]),
      emptyCommunityProject(),
    ]);
  }

  protected removeCommunityProject(index: number): void {
    this.updateIn("communityProjects", (list) =>
      (list as CommunityProject[]).filter((_, i) => i !== index),
    );
  }
}
