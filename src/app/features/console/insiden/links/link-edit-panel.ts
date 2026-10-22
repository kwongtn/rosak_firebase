import { computed, inject, signal, type WritableSignal } from "@angular/core";
import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  isoToOccurredAtInput,
  occurredAtInputToIso,
} from "../../../insiden/data/link-occurred-at.util";
import {
  DELETE_SOCIAL_MEDIA_LINK_MUTATION,
  DeleteSocialMediaLinkData,
  DeleteSocialMediaLinkVars,
  SocialMediaLinkRow,
  UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
  UpdateSocialMediaLinkData,
  UpdateSocialMediaLinkVars,
} from "../data/insiden-console.queries";
import {
  indexCategoriesById,
  indexLinesById,
  indexStationsById,
  indexVehiclesById,
  type ReferenceData,
} from "./link-reference.util";
import type { LinksActions } from "./links-actions";

/**
 * The links queue's detail sheet: the selected row, its edit form (the same field set as "Submit
 * a link"), Save, Delete and the sheet's status verbs, which call the row's own verbs. `links` is
 * the queue's rows, patched after a save or a delete; `referenceData` is the page's reference
 * read, which labels the tags of a saved row. Call in an injection context.
 */
export function injectLinkEditPanel(
  links: WritableSignal<SocialMediaLinkRow[]>,
  actions: LinksActions,
  referenceData: () => ReferenceData,
) {
  const graphql = inject(GraphQLClient);
  const auth = inject(AuthService);
  const toast = inject(ToastService);

  const selectedLink = signal<SocialMediaLinkRow | null>(null);

  /** Edit form state — same signals as LinkFormComponent's fields, driven by
   * the console's own sheet instead of LinkSheetService. */
  const editUrl = signal("");
  const editTitle = signal("");
  /** "When did this happen?" — a `datetime-local` value (`YYYY-MM-DDTHH:mm`, naive
   *  local wall time), hydrated from the row's `occurredAt` and NOT from `created`:
   *  a link whose event time differs from its report time is exactly the one an
   *  admin opens this sheet to correct, so hydrating from the wrong column would
   *  quietly rewrite it on the very next save. */
  const editOccurredAt = signal("");
  const urlTouched = signal(false);
  const isEditing = signal(false);
  const isSaving = signal(false);
  const isDeleting = signal(false);

  const selectedLineIds = signal<string[]>([]);
  const selectedVehicleIds = signal<string[]>([]);
  const selectedStationIds = signal<string[]>([]);
  const selectedCategoryIds = signal<string[]>([]);

  /** Mirrors link-form.schema's `required(f.url)` — Save is disabled while the URL is blank. */
  const canSave = computed(() => editUrl().trim().length > 0);

  function openLinkDetail(link: SocialMediaLinkRow): void {
    selectedLink.set(link);
    isEditing.set(true);
    editUrl.set(link.url);
    editTitle.set(link.title);
    // From `occurredAt`, never from `created` — see editOccurredAt's comment.
    editOccurredAt.set(isoToOccurredAtInput(link.occurredAt));
    urlTouched.set(false);
    selectedLineIds.set(link.lines.map((line) => line.id));
    selectedVehicleIds.set(link.vehicles.map((vehicle) => vehicle.id));
    selectedStationIds.set(link.stations.map((station) => station.id));
    selectedCategoryIds.set(link.categories.map((category) => category.id));
  }

  function closeLinkPanel(): void {
    selectedLink.set(null);
    isEditing.set(false);
    editUrl.set("");
    editTitle.set("");
    // Reset with the rest of the form: a closed sheet must not carry one row's
    // event time into the next one an admin opens.
    editOccurredAt.set("");
    urlTouched.set(false);
    selectedLineIds.set([]);
    selectedVehicleIds.set([]);
    selectedStationIds.set([]);
    selectedCategoryIds.set([]);
  }

  function onEditUrlInput(value: string): void {
    editUrl.set(value);
    urlTouched.set(true);
  }

  function onEditTitleInput(value: string): void {
    editTitle.set(value);
  }

  function onEditOccurredAtInput(value: string): void {
    editOccurredAt.set(value);
  }

  /** Full edit — same field set as "Submit a link". The backend replaces
   *  lines/vehicles/stations/categories from the input verbatim, so the payload
   *  carries the complete form state, not just the edited scalars. */
  async function saveLinkEdit(): Promise<void> {
    const link = selectedLink();
    if (!link) {
      return;
    }
    if (!canSave()) {
      urlTouched.set(true);
      return;
    }
    isSaving.set(true);
    try {
      const idToken = await auth.idToken();
      await graphql.request<UpdateSocialMediaLinkData, UpdateSocialMediaLinkVars>(
        UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
        {
          socialMediaLinkId: link.id,
          input: {
            url: editUrl(),
            title: editTitle() || null,
            lineIds: selectedLineIds(),
            vehicleIds: selectedVehicleIds(),
            stationIds: selectedStationIds(),
            categoryIds: selectedCategoryIds(),
            // ⚠️ ALWAYS send this key, and never write it as `?? undefined` or
            // `link.occurredAt ?? null`. `SocialMediaLinkInput` is
            // replace-not-patch and `occurredAt` is tri-state with a
            // DESTRUCTIVE third state:
            //   omitted        → leave the event time untouched
            //   a datetime     → set it
            //   explicit null  → RESET it to the row's submission time
            // So an untouched box round-trips the link's current event time (the
            // normal save), and a CLEARED box sends the explicit `null` on
            // purpose — "this actually happened when it was reported" is exactly
            // what null encodes, and it is the one place an admin can undo a
            // wrong guess. Omitting the key instead would make "cleared"
            // unreachable from a visible-but-empty control. Mirrors
            // LinkFormComponent.submit's identical branch.
            occurredAt: occurredAtInputToIso(editOccurredAt()),
          },
        },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      const updated = buildUpdatedLink(link);
      links.update((list) =>
        list.map((existing) => (existing.id === link.id ? updated : existing)),
      );
      selectedLink.set(updated);
      toast.success("Link updated", updated.url);
    } catch (err) {
      toast.error("Couldn't save changes", err instanceof Error ? err.message : "Unknown error");
    } finally {
      isSaving.set(false);
    }
  }

  /** Rebuilds the local row from the saved form state so the table row and the
   *  detail card show exactly what the backend now holds. Preference goes to
   *  reference data (it carries the display labels); anything the reference set
   *  doesn't know yet falls back to the row's own objects. */
  function buildUpdatedLink(link: SocialMediaLinkRow): SocialMediaLinkRow {
    const resolve = <T extends { id: string }>(
      ids: string[],
      current: T[],
      lookup: (id: string) => T | undefined,
    ): T[] =>
      ids
        .map((id) => lookup(id) ?? current.find((item) => item.id === id))
        .filter((x): x is T => x !== undefined);
    const reference = referenceData();
    const linesById = indexLinesById(reference);
    const vehiclesById = indexVehiclesById(reference);
    const stationsById = indexStationsById(reference);
    const categoriesById = indexCategoriesById(reference);
    return {
      ...link,
      url: editUrl(),
      title: editTitle(),
      // Mirrors the tri-state the server just applied: a cleared box RESETS the
      // event time to the submission time, so the optimistic row must show that
      // same fallback rather than keep the stale value it is replacing.
      occurredAt: occurredAtInputToIso(editOccurredAt()) ?? link.created,
      lines: resolve(selectedLineIds(), link.lines, (id) => linesById.get(id)),
      vehicles: resolve(selectedVehicleIds(), link.vehicles, (id) => vehiclesById.get(id)),
      stations: resolve(selectedStationIds(), link.stations, (id) => stationsById.get(id)),
      categories: resolve(selectedCategoryIds(), link.categories, (id) => categoriesById.get(id)),
    };
  }

  /** The detail sheet's Approve — the SAME two-write sequence the row's Approve
   *  runs, reached through the same `approveLink`, so the two surfaces cannot
   *  disagree about what approving means (and there is deliberately no
   *  panel-only variant to drift).
   *
   *  It closes the panel when the PUBLISH succeeded, including the partial-failure
   *  case: the row is live either way, the toast has already said whether it was
   *  also retired, and the sheet's `selectedLink` is a stale copy of a row the
   *  reload has already replaced. `markCompletedFromPanel` closes on the same
   *  rule. */
  async function approveFromPanel(): Promise<void> {
    const link = selectedLink();
    if (!link) {
      return;
    }
    const ok = await actions.approveLink(link);
    if (ok) {
      closeLinkPanel();
    }
  }

  async function markCompletedFromPanel(): Promise<void> {
    const link = selectedLink();
    if (!link) {
      return;
    }
    const ok = await actions.markCompleted(link);
    if (ok) {
      closeLinkPanel();
    }
  }

  /** The sheet's Hide — the same `hideLink` the row calls (including its
   *  conversation-coupling confirm), reached from the panel so the two surfaces
   *  cannot disagree. Closes on success, like the other panel verbs. */
  async function hideFromPanel(): Promise<void> {
    const link = selectedLink();
    if (!link) {
      return;
    }
    const ok = await actions.hideLink(link);
    if (ok) {
      closeLinkPanel();
    }
  }

  /** The sheet's Unhide — the same single-write `unhideLink` the row calls, with
   *  no completion step. Closes on success. */
  async function unhideFromPanel(): Promise<void> {
    const link = selectedLink();
    if (!link) {
      return;
    }
    const ok = await actions.unhideLink(link);
    if (ok) {
      closeLinkPanel();
    }
  }

  /** Admin hard-delete of a link entry. Mirrors the spotting-history delete:
   *  a native confirm guard, then the admin mutation; on success the row is
   *  dropped locally and the panel closes. */
  async function deleteLink(link: SocialMediaLinkRow): Promise<void> {
    if (!confirm("Delete this link entry? This can't be undone.")) {
      return;
    }
    isDeleting.set(true);
    try {
      const idToken = await auth.idToken();
      await graphql.request<DeleteSocialMediaLinkData, DeleteSocialMediaLinkVars>(
        DELETE_SOCIAL_MEDIA_LINK_MUTATION,
        { linkId: link.id },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      links.update((list) => list.filter((existing) => existing.id !== link.id));
      if (selectedLink()?.id === link.id) {
        closeLinkPanel();
      }
      toast.success("Link deleted", link.url);
    } catch (err) {
      toast.error("Couldn't delete link", err instanceof Error ? err.message : "Unknown error");
    } finally {
      isDeleting.set(false);
    }
  }

  return {
    selectedLink,
    editUrl,
    editTitle,
    editOccurredAt,
    urlTouched,
    isEditing,
    isSaving,
    isDeleting,
    selectedLineIds,
    selectedVehicleIds,
    selectedStationIds,
    selectedCategoryIds,
    canSave,
    openLinkDetail,
    closeLinkPanel,
    onEditUrlInput,
    onEditTitleInput,
    onEditOccurredAtInput,
    saveLinkEdit,
    approveFromPanel,
    markCompletedFromPanel,
    hideFromPanel,
    unhideFromPanel,
    deleteLink,
  };
}
