import { Injectable, signal } from "@angular/core";

/**
 * The five things a reader came to this page to do. Deliberately INTENT-shaped rather than
 * feature-shaped: "my train is late", "nothing is moving", "I saw a train", "here is a link",
 * "something broke" — not "line status", "spotting", "links", "incidents". The tile copy is what a
 * rider would say out loud, and each one maps onto exactly one existing submission surface
 * (see `ReportChooserComponent`), so no intent needs a feature of its own.
 *
 * 🔴 "Stopped" is NOT a new status value: it dispatches the ordinary line-status sheet with the
 * existing `DISRUPTED` PassengerStatus pre-selected. The chooser invents nothing the backend does
 * not already accept.
 */
export type ReportIntent = "delay" | "stopped" | "spot" | "link" | "incident";

/** The intents that cannot dispatch without a line, so they take the picker step first. */
export const LINE_INTENTS: readonly ReportIntent[] = ["delay", "stopped", "spot"];

/** True when the intent has to name a line before its sheet can open. */
export function isLineIntent(intent: ReportIntent): boolean {
  return LINE_INTENTS.includes(intent);
}

/**
 * The report chooser's sheet controller — the front page's ONE trigger for every submission
 * surface, mirroring `LinkSheetService` (root-provided signals, `open()` / `setOpen()`).
 *
 * The intent is STATE rather than a template flag on purpose: the tiles and the line picker are two
 * steps of one flow, so "which step am I on" has to survive a repaint, a viewport change and a
 * re-render of the sheet body — a component-local boolean would not, and the chooser is hosted by
 * the page while the flow is driven from the hero's CTA and the mobile action bar.
 *
 * 🔴 The intent is one-shot in the same way `ReportSheetService.lineId` is: `open()` clears it, so a
 * chooser reopened from a stale trigger never resurrects a half-finished "which line?" step.
 */
@Injectable({ providedIn: "root" })
export class ReportChooserService {
  readonly isOpen = signal(false);

  /** The line-based intent being completed, or `null` while the tiles are showing. */
  readonly intent = signal<ReportIntent | null>(null);

  /** Opens the chooser on the TILES step, whatever was half-finished last time. */
  open(): void {
    this.intent.set(null);
    this.isOpen.set(true);
  }

  /** Advances to the line picker for an intent that needs a line. */
  choose(intent: ReportIntent): void {
    this.intent.set(intent);
  }

  /** Back from the picker to the tiles, keeping the sheet open. */
  backToTiles(): void {
    this.intent.set(null);
  }

  setOpen(open: boolean): void {
    if (!open) {
      this.intent.set(null);
    }
    this.isOpen.set(open);
  }
}
