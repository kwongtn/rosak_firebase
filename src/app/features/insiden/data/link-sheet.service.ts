import { Injectable, signal } from "@angular/core";

/** Per-incident targeting context for a link submission (Task 14): set when the sheet is
 * opened from an incident card; `null` means the plain "just-dumping" flow. */
interface LinkSheetContext {
  incidentId: string;
  /** Optional incident title for the read-only context line; falls back to the id. */
  incidentTitle?: string | null;
}

/**
 * Structural edit payload the form hydrates from — looser than `PublicSocialMediaLink`, because
 * the shared card emits its structural `LinkCardItem` and the home feed node carries no
 * vehicle/station/category tags. Missing tags hydrate as empty selections (`?? []` in the form),
 * which is exactly what a link with no tags looks like.
 */
interface LinkEditTarget {
  id: string;
  url: string;
  title: string;
  lines: Array<{ id: string }>;
  vehicles?: Array<{ id: string }>;
  stations?: Array<{ id: string }>;
  categories?: Array<{ id: string; name: string }>;
}

@Injectable({
  providedIn: "root",
})
export class LinkSheetService {
  readonly isOpen = signal(false);

  /** Incident being targeted — `null` means the just-dumping flow. The form renders a
   * read-only context line from this and resets it in `clear()` (close/submit) so no stale
   * context survives. */
  readonly context = signal<LinkSheetContext | null>(null);

  /** Link being edited — `null` means the sheet is in create mode. The form hydrates from
   * this on open and resets it on clear/close so no stale edit survives. */
  readonly editTarget = signal<LinkEditTarget | null>(null);

  /** One-shot URL the form should pre-fill the next time it opens in create mode. Set only
   * through `open()`'s second argument (the home feed's quick form "Advanced Input"); the
   * form consumes it via `takePrefillUrl()`. `null` means "no prefill — open blank". */
  readonly prefillUrl = signal<string | null>(null);

  /** Opens the sheet in create mode. Call with a per-incident context to target an
   * incident, or with no argument to keep the just-dumping flow (backward compatible with
   * all existing `open()` call sites). The optional `prefill` seeds the URL field once
   * (home's quick form); omitting it opens blank as before. */
  open(context?: LinkSheetContext, prefill?: { url?: string }): void {
    this.context.set(context ?? null);
    this.editTarget.set(null);
    this.prefillUrl.set(prefill?.url?.trim() || null);
    this.isOpen.set(true);
  }

  /** Opens the sheet in edit mode for an existing link (author-or-admin gated by the
   * caller via canEditLink). Mutually exclusive with `open()`: sets the edit target and
   * clears any incident targeting. Never prefills — edit hydration owns the URL. */
  openEdit(link: LinkEditTarget): void {
    this.context.set(null);
    this.editTarget.set(link);
    this.prefillUrl.set(null);
    this.isOpen.set(true);
  }

  /** Consumes the pending prefill (consume-once): returns it and clears it, so reopening
   * without a new `open(..., { url })` yields `null` and a blank field. */
  takePrefillUrl(): string | null {
    const url = this.prefillUrl();
    this.prefillUrl.set(null);
    return url;
  }

  close() {
    this.prefillUrl.set(null);
    this.isOpen.set(false);
  }

  setOpen(open: boolean) {
    if (!open) {
      this.prefillUrl.set(null);
    }
    this.isOpen.set(open);
  }
}
