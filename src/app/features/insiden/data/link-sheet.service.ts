import { Injectable, signal } from "@angular/core";

/** Per-incident targeting context for a link submission (Task 14): set when the sheet is
 * opened from an incident card; `null` means the plain "just-dumping" flow. */
export interface LinkSheetContext {
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
export interface LinkEditTarget {
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

  /** Opens the sheet in create mode. Call with a per-incident context to target an
   * incident, or with no argument to keep the just-dumping flow (backward compatible with
   * all existing `open()` call sites). */
  open(context?: LinkSheetContext): void {
    this.context.set(context ?? null);
    this.editTarget.set(null);
    this.isOpen.set(true);
  }

  /** Opens the sheet in edit mode for an existing link (author-or-admin gated by the
   * caller via canEditLink). Mutually exclusive with `open()`: sets the edit target and
   * clears any incident targeting. */
  openEdit(link: LinkEditTarget): void {
    this.context.set(null);
    this.editTarget.set(link);
    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
  }

  setOpen(open: boolean) {
    this.isOpen.set(open);
  }
}
