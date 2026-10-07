import { Component, input, output } from "@angular/core";
import { HlmButton } from "../../../../ui/button/button";
import { HlmInput } from "../../../../ui/input/input";
import { HlmNativeSelect } from "../../../../ui/select/native-select";
import {
  canMoveDown,
  canMoveUp,
  type ChronologyDraft,
} from "../../../insiden/incident-form/chronology-list.util";
import { type ChronologyIndicator } from "../data/insiden-console.queries";
import type { ChronologyExtractState } from "./pending-incident.util";

const INDICATORS: ChronologyIndicator[] = ["GREEN", "RED", "BLUE", "GRAY"];

/**
 * The detail panel's chronology editor: the list of draft entries with collapse/move/remove,
 * the per-entry AI "Extract Data" flow surface, and the "Summarize Incident" action. Purely
 * presentational — the host IS the parent's `<section>` (attribute selector); every list
 * mutation is emitted to the parent, which owns the `chronologies` signal and the extract
 * bookkeeping. The child only derives the per-key disabled/flag state from its inputs.
 */
@Component({
  selector: "section[app-pending-chronology-editor]",
  imports: [HlmButton, HlmInput, HlmNativeSelect],
  templateUrl: "./pending-chronology-editor.component.html",
})
export class PendingChronologyEditorComponent {
  readonly chronologies = input.required<ChronologyDraft[]>();
  readonly extractStates = input.required<ReadonlyMap<number, ChronologyExtractState>>();
  readonly isSummarizing = input.required<boolean>();

  readonly add = output<void>();
  readonly remove = output<number>();
  readonly toggleCollapsed = output<number>();
  readonly moveBy = output<{ index: number; offset: -1 | 1 }>();
  readonly extract = output<number>();
  readonly replace = output<number>();
  readonly undo = output<number>();
  readonly summarize = output<void>();

  protected readonly indicators = INDICATORS;

  protected canMove(index: number, direction: "up" | "down"): boolean {
    return direction === "up"
      ? canMoveUp(this.chronologies(), index)
      : canMoveDown(this.chronologies(), index);
  }

  protected isExtracting(key: number): boolean {
    return this.extractStates().get(key)?.extracting ?? false;
  }

  protected hasLateResult(key: number): boolean {
    return (this.extractStates().get(key)?.lateResult ?? null) !== null;
  }

  protected isReplaced(key: number): boolean {
    return this.extractStates().get(key)?.replaced ?? false;
  }
}
