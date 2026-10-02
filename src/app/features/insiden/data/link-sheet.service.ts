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
 * the shared card emits its structural `LinkCardItem` and a read-only surface has no edit path to
 * round-trip tags through.
 *
 * 🔴 The three tag lists are OPTIONAL here, and that optionality is a LOAD-BEARING distinction,
 * not a convenience: "this host's document does not select them" and "this link has no tags" are
 * the same value at runtime, and the form reads both as an empty selection. Because
 * `SocialMediaLinkInput` is replace-not-patch — the backend assigns the title and calls `.set()` on
 * lines/vehicles/stations/categories unconditionally — an empty selection is an instruction to
 * blank the relation, not the absence of one. So a host that opens this sheet for a row whose
 * document omitted the tags does not show an untagged form; it shows a form that, on save, deletes
 * the row's real tags. Every host with an edit path therefore selects them (see `FEED_QUERY` and
 * `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY`), and `home.queries.spec.ts` pins that the feed keeps doing so.
 *
 * `occurredAt` ("when did this happen") is OPTIONAL for a different reason: it is only present on
 * hosts whose query selects it, and the form renders `isoToOccurredAtInput(undefined)` → `""` (an
 * empty, unset control) when it is absent. An unset event time is recoverable — the form sends an
 * explicit `null`, which the backend reads as "reset to the report time" — whereas a blanked tag
 * list is not. It is deliberately NOT folded into `created` here either: the two are different
 * instants and the form needs them apart.
 */
interface LinkEditTarget {
  id: string;
  url: string;
  title: string;
  /** "When did this happen", naive local wall time, no offset (`USE_TZ = False`). Distinct from
   *  `created`, which is the report time the sheet never shows. */
  occurredAt?: string;
  lines: Array<{ id: string }>;
  /** Vehicle tags. See the doc comment above: absent means "this host's query did not select
   *  them", and the save will blank the relation either way. */
  vehicles?: Array<{ id: string }>;
  /** Station tags. Same failure mode as `vehicles`. */
  stations?: Array<{ id: string }>;
  /** Calendar-incident-category tags. The form is a single-select and hydrates index 0. */
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
   * clears any incident targeting. Never prefills — edit hydration owns the URL.
   *
   * ⚠️ `link.vehicles` / `link.stations` / `link.categories` are NOT cosmetic here. This sheet
   * replaces the whole editable set server-side, so a caller that opens a row whose document did
   * not select them wipes the row's tags on save — silently, behind a form that looks like it
   * simply had nothing to show. Pass a row that carries them; `LinkEditTarget`'s optionality
   * exists for read-only surfaces, not for a caller that has an edit button. */
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
