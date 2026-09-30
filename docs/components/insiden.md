# Component: insiden

## 📌 Purpose & Scope

- **Core Responsibility:** Community incident reporting for line/vehicle/station-level service
  disruptions (signal failures, breakdowns, train crashes, etc.). A month calendar (severity dots
  per day) drives a day-scoped incident list, plus an always-visible "Ongoing & Long-Running"
  section for unresolved/long-term incidents regardless of which day is selected. Logged-in users
  report and edit incidents through the full approval lifecycle (create → pending → admin approve),
  vote on incidents and individual chronology rows, request chronology deletions, attach photos,
  and submit per-incident social links. Admins moderate everything through the console queues.
  It is a direct Angular port of the legacy `src/app/insiden/` feature (ng-zorro calendar +
  event-list), rebuilt on signals and the new design system.
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed feature). Composed of one
  routed page (`InsidenPage`), presentational children (`IncidentCalendarComponent`,
  `IncidentCardComponent`, `IncidentFormComponent`, `LinkFormComponent`, `LinksSectionComponent`,
  `LinkCardComponent`, `LinkThreadComponent`, `VoteButtonComponent`, `AssetMultiSelectComponent`),
  backed by a `data/` layer of pure query/util modules and two sheet services (no state store of its
  own).

  This feature also **owns the shared link primitives** other features render: `app-link-card`
  (every link row in the app), `app-link-thread` (its collapsible thread wrapper), `app-link-list`
  and `app-link-sheet`, plus the two pure util modules the link surface's forms and grouping UIs
  read. It hosts them but renders no thread UI itself — `/insiden` stays a flat, complete list
  (see Internal State).

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:**
  - `InsidenPage` (route: `/insiden` and `/insiden/:date`, via a custom `pathWithOptionalParamMatcher`
    in `app.routes.ts`): `dateParam = input<string | undefined>(undefined, { alias: "date" })` —
    absent on the bare `/insiden` route, which then defaults to "today" rather than redirecting.
  - `IncidentCalendarComponent`: `incidents = input.required<CalendarIncident[]>()`,
    `selectedDate = input.required<string>()` (a `YYYY-MM-DD` key).
  - `IncidentCardComponent`: `incident = input.required<CalendarIncident>()`,
    `editActionEnabled = input(true)` (console hosts the card with this set to `false` — it has its
    own panel editing, so the edit/request-deletion/add-link affordances are hidden there).
  - `IncidentFormComponent`: hydrates from `IncidentSheetService.editTarget` (a
    `signal<CalendarIncident | null>`); no-arg `open()` stays create-only.
  - `LinkFormComponent`: reads `LinkSheetService.context` (`{ incidentId, incidentTitle? }`) to
    target a submission at a specific incident; no-arg open is the just-dumping flow. Its edit target
    is the structural `LinkEditTarget` (vehicles/stations optional), so the home feed's node — which
    selects neither — hydrates as an empty selection. A create-mode open also applies the sheet's
    one-shot URL prefill (home's "Advanced Input") once; edit mode never does.
  - `LinkCardComponent` (shared `app-link-card`): `link = input.required<LinkCardItem>()` — the
    structural contract both `PublicSocialMediaLink` and the home feed's `FeedLink` satisfy with no
    host mapping — `userVote = input(0)` (host overlay) and `editable = input(false)` (host-gated
    with `canEditLink`, author or admin).
  - `LinkThreadComponent` (shared `app-link-thread`, the collapsible thread wrapper): `link` is an
    `input.required<LinkCardItem>()` holding the thread ROOT, plus
    `userVote = input<number | null>(null)` (root-only scalar overlay; `null` means "not supplied"
    so the per-id `voteValues` entry or the backend's own `link.userVote` still wins — a `0` default
    would be indistinguishable from "the host removed my vote"),
    `voteValues = input<Record<string, number>>({})` (the host's per-link
    overlay, forwarded to **every** card in the group, same contract as `app-link-list`), and
    `editable = input(false)` (root only — members are read-only, because a collapsed group is a
    summary and the host's edit flow is root-driven). No recursion: depth is 1 by model invariant
    (`thread` always points at a root), so members render with no thread UI of their own.
  - `VoteButtonComponent`: `targetType = input<"incident" | "chronology" | "link">("incident")` — the
    same button drives incident, chronology and social-media-link votes (the shared link card hosts
    it with `targetType="link"`).
- **Outputs / Events / API Responses:**
  - `IncidentCalendarComponent.daySelected = output<string>()` — emits a `dateKey` on day click,
    "Today", month/year jump commit, or prev/next-month navigation; `InsidenPage` reacts by calling
    `router.navigate(["/insiden", dateKey])`, keeping the viewed day a real, shareable URL rather
    than local-only UI state.
  - `LinkCardComponent.voteChanged = output<{ value: number }>()` — after a successful vote (the
    link-list host records it in its `voteValues` overlay); `edit = output<LinkCardItem>()` — the
    edit pencil, host-gated with `canEditLink`. `LinkListComponent.voteChanged` re-emits it with
    the voted link's id as `{ id: string; value: number }`.
  - `LinkThreadComponent.voteChanged = output<{ id: string; value: number }>()` — the same re-emit,
    with the id added, because the wrapper renders N cards per row and a member is votable too;
    `edit = output<LinkCardItem>()` from whichever card opened its pencil.
  - GraphQL query `INSIDEN_INCIDENTS_QUERY` (`data/insiden.queries.ts`) accepts optional filters.
    `/insiden` fetches incidents overlapping the selected month plus 14 days on each side,
    OR unresolved incidents for the pinned section. Changing months reloads the window;
    selecting another day in the same month reuses it. The situasi consumer retains its
    unfiltered query. The sub-selects
    now carry the full lifecycle surface: `status`, `version`, `user { shortId }`, `categories`,
    chronology `status` + vote fields, per-incident `links` (first page of the connection), and
    `medias` with `id` + `uploader { nickname }`.
  - `CalendarIncident` shape: id, start/end datetime, `severity` (`MAJOR`/`MINOR`/`OTHERS`),
    `status` (`DRAFT`/`PENDING_APPROVAL`/`LIVE`/`REJECTED`), title, brief, details, `hasDetails`,
    `impactFactor`, `version`, `longTerm`, `inaccurate`, `lastUpdated`, author `user`, related
    `lines`/`vehicles`/`stations`, `categories`, `chronologies[]` (ordered timeline entries with
    `status`, `voteScore`, `voteBreakdown`, `userVote`), `links` (connection), and `medias[]`.
  - Mutations (`data/insiden.queries.ts`): `CREATE_CALENDAR_INCIDENT_MUTATION`,
    `UPDATE_CALENDAR_INCIDENT_MUTATION` (sends `version` for OCC; returns the revision `id` when a
    non-admin LIVE edit created a draft, which the form then chains into
    `SUBMIT_CALENDAR_INCIDENT_MUTATION`), `UPVOTE`/`DOWNVOTE`/`REMOVE_VOTE` (incident + chronology
    variants), `REQUEST_CHRONOLOGY_DELETION_MUTATION`, `SUBMIT_SOCIAL_MEDIA_LINK_MUTATION`
    (carries `incidentId` when targeted).
  - **A social-media link has TWO time axes, and the frontend must never conflate them.** `created`
    is "when someone _reported_ it" (moderation provenance); `occurredAt` is "when it _happened_" —
    NOT NULL on the backend, indexed, backfilled from `COALESCE(posted_at, created)`, and the leading
    key of **every** ordering, window and keyset cursor (`-occurredAt, -id`; the feed's
    `currentServiceDayOnly` / `lastWeekOnly` / `alignPageToDay` windows; the console queue;
    the per-incident `links` connection). Both strings are **naive local wall time with no offset**
    (the backend runs `USE_TZ = False` with `TIME_ZONE = Asia/Kuala_Lumpur`, often with
    microseconds) — never re-format them through UTC.
    On the type: `LinkCardItem.occurredAt` and `PublicSocialMediaLink.occurredAt` are both
    **optional** (they are selected per GraphQL document), but `created` stays **required**,
    because it is the display fallback `occurredAt ?? created` and the tooltip's absolute stamp — a
    document that selects `occurredAt` and drops `created` would render a blank time.
  - **`occurredAt` on the inputs is TRI-STATE, and one of the three states is destructive**
    (backend `SocialMediaLinkInput.occurred_at: Maybe[datetime | None] = UNSET`):

    | sent                | `updateSocialMediaLink` does                                              |
    | ------------------- | ------------------------------------------------------------------------- |
    | key **omitted**     | leave the event time untouched                                            |
    | a datetime string   | set it                                                                    |
    | explicit **`null`** | **RESET** the row to its `created` ("this happened when it was reported") |

    Consequence for every editor: an editor that **hydrates a visible control** must send the key
    **always** — never `?? undefined` (that makes "cleared" unreachable and strands a control you
    can see but not clear) and never `row.occurredAt ?? null` (that would reset the timestamp on
    every save). The **console's** status-only verbs are the mirror image: they do not own a control,
    so they must re-send the row's value **verbatim** (`linkStatusInput`) and omit the key only when
    the row genuinely has no event time. On the **create** path, omitted and explicit `null` are
    identical server-side (both stamp the submission instant), so the submit path omits the key —
    the honest spelling — which is why `LinkFormComponent.submit` and the console's `saveLinkEdit`
    branch differently.

  - Photo upload is fire-and-forget: `IncidentCardComponent.uploadPhotos()` pushes each pending
    file to `ImageUploadService.addToQueue(incidentId, file, "INCIDENT_CALENDAR_INCIDENT")`; no
    direct response is awaited by the component (the service manages its own upload queue/retries).
    Thumbnails open an in-page `MediaViewerComponent` overlay (same mechanism as `/gallery`), not a
    new tab.
- **Dependencies:**
  - `graphqlResource()` (`core/graphql/graphql-client.ts`) — signal-based reactive GraphQL query
    wrapper over Angular's `httpResource`, giving free SSR TransferState hydration, background retry
    with exponential backoff, and `isLoading`/`hasError`/`retryCountdownSec`/`retryNow` semantics.
    `GraphQLClient.request` is used directly for continuation pages (link infinite scroll).
  - `AuthService` (`core/auth/auth.service.ts`) — login state for the edit/vote/link gates and the
    author check (`user.shortId` vs `uid.slice(0, 8)`).
  - `ImageUploadService` (`core/upload/image-upload.service.ts`) — app-wide, IndexedDB-persisted
    photo upload queue (depends on `AuthService` for the Firebase auth token and
    `upload-queue-db.ts` for persistence); `ImageFile` (`core/upload/image-file.ts`) is the shared
    upload-candidate model.
  - `MediaViewerComponent` (`features/gallery/media-viewer/`) — cross-feature reuse for the in-page
    photo preview; `incidentMediaToViewerNode()` maps `MediaScalar` into its `MediaNode` input.
  - `ToastService` (`ui/toast/toast.service.ts`) — thin wrapper for success/error/info toasts.
  - `RetryBannerComponent` (`ui/retry-banner/retry-banner.component.ts`) — shared error-state UI,
    consumes any object matching the minimal `RetryableResource` interface (`retryCountdownSec`,
    `retryNow`), so it works with `graphqlResource()`'s return shape without a hard type dependency.
  - `InfiniteScrollDirective` (`ui/infinite-scroll/`) — IntersectionObserver sentinel for the
    cursor-paginated link lists (Submitted Links tab + per-card link sections).
  - `HlmSkeleton`, `HlmButton`, `HlmBadge`, `HlmCardImports`, `HlmCombobox`/`ComboboxItem`,
    `HlmSheet` — design system primitives from `src/app/ui/*`.
  - `AppNavComponent`, `AppFooterComponent` (`shell/app-nav`, `shell/app-footer`) — page chrome.
  - `PhotoPickerComponent` (`features/spotting/report-form/photo-picker/`) — cross-feature reuse
    from the "spotting" feature; exposes a `model<ImageFile[]>` two-way `files` binding and an
    `isCompressing` computed signal.
  - `MarkdownComponent` (`ngx-markdown`, third-party) — renders an incident's long-form `details`
    field as Markdown.
  - `Router` (`@angular/router`) — drives day selection via URL navigation.

## ⚙️ Internal State & Logic

- No RxJS subjects and no dedicated store — state is entirely Angular signals, computed at several
  levels:
  - `InsidenPage`: `selectedDate`/`selectedDateObj` computed from the route param (or "today");
    `incidentsResource` (the `graphqlResource`) is the single source of truth for all incident
    data; `allIncidents`, `_sorted` (newest-first by `startDatetime`), `dayIncidents` (incidents
    covering the selected day) and `pinned` (unresolved incidents not already shown for the day)
    are all derived `computed()`s over that one resource. An `effect` on
    `IncidentSheetService.isOpen()` (true→false transition) reloads the resource, so a successful
    create/edit refresh is driven by the sheet close.
  - `IncidentCalendarComponent`: `viewedMonth` is a `linkedSignal` seeded from `selectedDate` (so
    deep links land on the right month) but independently writable by month navigation; `weeks()`
    and `_countsByDate()` derive the 42-cell grid and per-day severity-dot counts from
    `incidents()` + `viewedMonth()`. A small local state machine (`pendingMonth`/`pendingYear`,
    `jumpCounting`/`jumpProgress`, backed by `setTimeout`/`setInterval`) implements a 3-second
    "commit window" after a month/year combobox pick, cleaned up in `ngOnDestroy`.
  - `IncidentCardComponent`: local UI-only signals (`detailsExpanded`, `photosExpanded`,
    `pendingPhotos`, `viewerMedia`, `deletionOverride`); `chronology`, `duration`, `isOngoing`,
    `isInaccurate`, `severityVariant`/`severityLabel`, `canEdit` (via the pure
    `canEditIncident()` util) are computed from the `incident` input. A live elapsed-time ticker
    (`elapsedTime` signal + `setInterval`, started in `afterNextRender`) runs only while
    `isOngoing()`, torn down via `DestroyRef`/`ngOnDestroy`. The card renders: chronology timeline
    with per-row status tags (`chronologyStatusLabel()`) and vote buttons, a "Request deletion"
    ghost button on LIVE rows (flips the row to `PENDING_DELETION` locally on success), a Links
    section (spec-format rows `[yyyy-mm-dd hh:mm] [favicon] [bold domain + paler rest]` — the label
    is the **displayed** instant, `occurredAt ?? created`, inside `incidentLinkLine`, so it agrees with
    the `-occurred_at, -id` order these rows arrive in; the nested `links(first: 10)` sub-select and
    the continuation query both select `occurredAt`, or the one list would label its first 10 rows by
    submission time and the rest by event time. Pending rows with an amber clock icon + "Pending
    approval" tooltip, continuation pages via the root
    `publicSocialMediaLinks(incidentId, first, after)` cursor — the same keyset the nested connection
    mints, so the cursor is forwarded verbatim and nothing here decodes it), the latest history entry
    line
    (via `calendarIncidentHistory`), and the in-page photo viewer.
  - `IncidentFormComponent`: `hydrate(incident)` consumes the pure `incidentToForm()` util
    (model + chronologies + four id arrays); `isEditing` derives from `editTarget` and switches
    header/footer labels and the submit branch. Edit submit sends all fields + `version` (OCC echo)
    - `impactFactor` echo; a returned revision `id` chains `SUBMIT_CALENDAR_INCIDENT_MUTATION`.
      GraphQL rejections (one-open-draft / version-mismatch) toast verbatim and keep the sheet open.
      The chronology section has per-row collapse plus a "Collapse all / Expand all" helper
      (`setAllCollapsed()`), up/down reorder arrows, the Gemini extract/summarize flows, indicator
      status dots (pure `indicatorLabel()`/`indicatorDotClass()` in chronology-list.util), and — on
      desktop — the color picker and datetime share a row. Categories are a mandatory single
      dropdown defaulting to "Just Reporting" on new reports (mirrors the link form; selected
      `selectedCategoryId` signal + derived array). In edit mode the footer button reads "Undo All"
      and re-hydrates the form from the edit target instead of clearing the session.
  - `LinksSectionComponent`: first page through `graphqlResource` (retry banner kept), continuation
    pages via `GraphQLClient.request` + the infinite-scroll sentinel. **Deliberately flat and
    thread-free**: neither the first-page resource nor `loadMore` sends `collapseThreads`, so every
    thread member stays a row of its own. Thread UI is scoped to the home feed and the admin console,
    and this tab is a browsable "everything submitted" view where hiding members behind a root would
    lose rows the reader came for. Omitting the key (rather than sending an explicit `false`) is how
    the tab says "use the schema default" — an explicit `null` is fatal on a `Boolean!` argument.
    Rendering is delegated to the
    shared `LinkListComponent` (see insiden shared components); this host only owns pagination and
    reload-on-sheet-close (dropping appended continuation pages of the stale dataset).
  - `LinkCardComponent` (shared, `app-link-card`): the single link-row element for every surface —
    home feed, /insiden links tab and situasi. Renders the favicon (Google S2, plain-link SVG
    fallback), the domain/path colour split (`linkUrlPartsOf`), the title, line badges, the Pending
    pill (`title="Awaiting admin approval"`, rendered only while the link's approval `status` is
    `PENDING_APPROVAL` — the contract field is `LinkCardItem.status?: string | null`, kept loose
    rather than narrowed to `SocialMediaLinkStatus` so both source node types satisfy it
    structurally; `completed` is the console's separate admin "mark handled" flag and does not drive
    it), the Official chip (`title="Captured automatically from an official operator account"`,
    rendered only when `LinkCardItem.isAutomated === true`; the field is selected by the home feed's
    `FEED_QUERY` **and** by the console's `SOCIAL_MEDIA_LINKS_QUERY` (both need the Official
    marker), while every other host leaves it undefined and shows no chip — `isAutomated` is
    optional on `LinkCardItem` precisely so those hosts satisfy the structural contract without it),
    and a right rail carrying the vote button plus the relative time and the edit pencil.
    **Two time axes:** the card _displays_ `occurredAt` ("when did this happen" — the instant
    every feed/queue orders on) through `occurredAt = computed(() => link().occurredAt ??
link().created)` and `occurredLabel = humanizeSince(occurredAt())`. That fallback is
    load-bearing, not defensive: `occurredAt` is optional per document and `strict` /
    `strictNullChecks` are OFF, so a host that forgot the field would render nothing at all
    without it. The `data-testid="link-created"` span is deliberately **not** renamed with the
    field (it is the stable DOM hook host specs assert on) while its value becomes the event
    time, and the tooltip's absolute stamp follows the same instant. `submittedAt` adds a
    second tooltip line (`data-testid="link-submitted"`, "Submitted MMM d, y HH:mm") **only
    when the two parsed instants differ** — compared by `Date.getTime()`, not by string, because
    the backend serialises microseconds and `created` may arrive without a fractional part;
    both absent or both equal gives no second line, so nothing is lost by promoting
    `occurredAt` to the visible label.
    The `<a>` wraps only the non-interactive body; both interactive controls are siblings of it, so
    their clicks can never navigate. Test ids: `link-url-domain` / `link-url-path` (the split URL),
    `link-tags`, `link-pending`, `link-official`, `link-meta-rail`, `link-time` / `link-created` /
    `link-submitted`, `link-submitter` and
    `link-edit`. The host passes `userVote` (its authenticated overlay wins over the anonymous feed
    value) and `editable` (gated with `canEditLink`); the card re-emits votes as `voteChanged` and
    the edit pencil as `edit`. **No thread UI lives in the card** — that belongs to the
    `app-link-thread` wrapper, so every other surface of this shared card stays byte-for-byte a
    flat list.
  - `LinkThreadComponent` (shared, `app-link-thread`): the collapsible group wrapper, and the
    **named extension point for any grouped row**. `members = computed(() => link().threadLinks ??
[])`; `totalCount` prefers the backend's `threadSize` (`1 + publicly-visible members`, so it
    already counts the root) and falls back to `members().length + 1` for a host that selected only
    the members. The affordance is gated on `members().length > 0` — **not** on `isThreadRoot`,
    because the backend defines a root as `thread == null`, which is also true of every ordinary
    unthreaded link, so that gate would put a "1 links" badge on every row in the app. `expanded =
signal(false)` — **collapsed by default**, the same pattern and reasoning as `app-link-list`'s
    "Pending (N)" section. The toggle is a real `<button>` (`hlmBtn` ghost, chevron rotating
    `rotate-180`) carrying `data-testid="link-thread-toggle"`, `aria-expanded`, an action-naming
    `aria-label` ("Show/Hide the other N link(s) in this thread") and the count as **readable text**
    in `data-testid="link-thread-size"` — the group size must be learnable without hovering. Expand
    renders `data-testid="link-thread-members"`, a `border-l pl-3` indented column of one
    `app-link-card` per member, `editable="false"`. `voteFor(link)` is the per-card fallback chain
    `voteValues[id]`, then the root's scalar `userVote` (root only), then `link.userVote ?? 0` —
    identical to `app-link-list`, so a link can move between the flat list and a thread without
    changing how its vote renders. **The root is rendered through the same `app-link-card` with the
    SAME inputs as a plain list row** — no wrapper class, no bold, no badge, no size change, and the
    spec asserts `outerHTML` parity between a threaded and an unthreaded root. That is a product
    decision, not an oversight: if the first link of a group looked different from every other link,
    the feed would grow a second visual hierarchy for no gain. The affordance sits BESIDE the card in
    its own `flex flex-col` row, never inside it. SSR-safe: no browser APIs.
  - `LinkFormComponent`: the model gained `occurredAt` (a `datetime-local` value, `""` = unset,
    deliberately unvalidated — blank is the common, correct answer). The control is placed last in the
    "Link" section — after Title, before the whole Tags block — because a rider fills the form in
    story order: what it is (URL) → what it's called (Title) → when it happened → where/what it
    concerns (tags). The tag block is a bulk-assignment panel rather than a linear read, so a clock
    dropped at the bottom of it would read like another filter. It renders **empty** by default (no
    `new Date()` "now" default): a server/client clock or timezone skew would otherwise emit two
    different `value=` attributes for one request, and `""` is the honest state because the server
    decides the report instant. Edit mode hydrates from `isoToOccurredAtInput(target.occurredAt)` —
    the **event** time, never `created`, because a link whose event time differs from its report time
    is exactly the one being edited and hydrating the wrong column would rewrite it on the next save.
    `submit()` branches on the tri-state: the edit path always sends
    `occurredAt: occurredAtInputToIso(m.occurredAt)` (a cleared box is the deliberate reset), the
    create path spreads `...(occurredAt ? { occurredAt } : {})`. `clear()` resets it with the rest of
    the model, so an edit-mode clear followed by a create-mode open cannot carry the edited row's
    event time into a new submission.
  - `LinkListComponent` (shared, `app-link-list`): host-agnostic link list taking an ordered
    `links` input + host-specific `emptyMessage` + a `voteValues` overlay (`Record<id, number>`).
    Owns the approval-axis split (approved = `status !== "PENDING_APPROVAL"`, pending =
    `status === "PENDING_APPROVAL"`; the separate `completed` handled flag never groups rows), the
    UTC day-group headers (Today/Yesterday/`MMMM d, y` via `groupLinksByDay()`) — UTC so SSR and
    browser agree on the buckets — the pending collapsible, and the edit pencil gated by the pure
    `canEditLink()`
    util (author shortId match or admin); the pencil opens the shared link sheet in edit mode via
    `LinkSheetService.openEdit()`. Re-emits each card's vote as `voteChanged = output<{ id: string;
value: number }>()` for the host's overlay. Emits `sheetClosed` on the sheet's open→closed edge
    so the host reloads its resource (an edit submit or cancel changed the data server-side).
  - `LinkSheetComponent` (shared, `app-link-sheet`): hosts the HlmSheet + LinkFormComponent pair
    (previously inlined in both `insiden.page.html` and the situasi section) with edit-aware
    header/footer labels ("Edit link"/"Save" vs "Submit a link"/"Submit"), an optional
    `defaultLineIds` input (line-prefilled submissions on the situasi tab) and
    `data-testid="submit-link"` on the submit button.
  - `LinkSheetService` (root, `data/link-sheet.service.ts`): `open(context?, prefill?)` opens create
    mode — the optional second arg `{ url? }` seeds a one-shot URL prefill (home's "Advanced
    Input"); `openEdit(link)` opens edit mode and never prefills; `close()`/`setOpen(false)` clear
    the pending prefill. The form consumes it through the consume-once `takePrefillUrl()` (returns
    and clears), so a later reopen without a new `open(..., { url })` starts blank. Existing
    `open()`/`open(context)` call sites are unchanged.
- Pure helper modules carry the non-trivial domain logic outside the components:
  `calendar-date.util.ts` (`dateKeyOf`, `incidentCoversDate`), `elapsed-time.util.ts`
  (`getReadableTimeDifference`), `incident-to-form.util.ts` (edit hydration), `can-edit.incident.util.ts`
  (incident edit-button gate matrix), `can-edit.link.util.ts` (link edit-button gate matrix),
  `link-day-group.util.ts` (`linkDisplayInstant`, `linkDateKey`, `linkDayLabel`, `groupLinksByDay` —
  `linkDisplayInstant(link)` is the ONE rule for "which instant does a link display":
  `occurredAt ?? created`; `groupLinksByDay` buckets on it, and the UTC frame is unchanged from before
  the field swap, only the bucketed field moved), `chronology-status.util.ts` (status labels +
  deletion predicates),
  `incident-link-line.util.ts` (spec link-line formatting; its `toLocalDateTimeLabel` and
  `datetimeLabel` read the display instant, `input.occurredAt ?? input.created`),
  `incident-media-viewer.util.ts` (photo → viewer node), `social-link.util.ts`,
  `incident-status.util.ts`, `incident-chronology.util.ts`, and the two modules the whole
  `occurredAt` + thread surface shares:
  - `link-occurred-at.util.ts` (`isoToOccurredAtInput`, `occurredAtInputToIso`) — the
    `datetime-local` ↔ API conversion, Angular-free and spec-covered in isolation. Consumed by the
    link form, the console edit sheet, and anything that hydrates a `datetime-local` from
    `occurredAt`. Mirrors the incident form's `isoToDateTimeLocal` but lives in its own module so no
    link surface has to reach into the incident form to format a timestamp.
  - `link-thread-selection.util.ts` (`toggleSelection`, `areAllSelected`, `canGroup`,
    `selectedWithin`, `threadLabel`) — the selection mechanics of the two grouping surfaces (the
    console triage table and the profile's "My Submitted Links"). Every function is a total,
    immutable function of its arguments (no Angular, no `signal`, no RxJS) and returns a NEW array,
    because the results are fed straight back into a signal: mutating in place yields the same
    reference, change detection never fires, and the checkbox silently stops updating. `threadLabel`
    is the **single place pluralisation is decided for a link thread anywhere in the app** — it
    backs the console triage chip, the "My Submitted Links" badge _and_ the `app-link-thread`
    indicator, and none of the three may grow its own `${n} link${n === 1 ? "" : "s"}`. That is
    not a style preference: one surface saying "1 links" while another says "2 link" is invisible to
    `tsc` (no type carries the string) and invisible to the spec suite, so it ships. INVARIANT: a
    new link-thread count joins the helper; nothing re-derives the noun. What legitimately differs
    between sites is the **gate** that decides whether a count is shown at all, not the string —
    see the extension point below.

## 🧩 Extension Points & Hooks

- `RetryableResource` is a structural interface, not a concrete type import — any future
  resource-like object (a different fetch wrapper, a mocked resource in tests) can drive
  `RetryBannerComponent` without coupling to `graphqlResource()`.
- `CalendarIncidentSeverity`/`ChronologyIndicator` → CSS-class/label lookup tables
  (`SEVERITY_DOT`, `SEVERITY_VARIANT`, `SEVERITY_LABEL`, `CHRONOLOGY_DOT`) are centralized
  `Record<...>` constants — adding a new severity or indicator value is a one-line addition per
  table rather than a scattered conditional.
- `defaultChronology()` in `incident-card.component.ts` is an isolated synthesis function for when
  the backend has no chronology entries — a natural seam for adjusting/enriching the fallback
  timeline without touching rendering logic.
- The GraphQL query is a single flat string constant (`INSIDEN_INCIDENTS_QUERY`); extending the
  fetched fields (e.g. adding a new backend field) is a local, additive edit to `insiden.queries.ts`
  with a matching `CalendarIncident` interface change — no query-building abstraction to route
  around. New fields follow the optional-field + DEPLOY-ORDER comment pattern.
- Pure utils are the gate/label/format seams: `canEditIncident()`, `canEditLink()`,
  `chronologyStatusLabel()`, `incidentLinkLine()`, `incidentToForm()`, `groupLinksByDay()`,
  `incidentMediaToViewerNode()` — each is a tested, isolated function a future feature can reuse
  or extend without touching component markup.
- **`app-link-thread` is the named extension point for any grouped link row.** It takes the same
  structural `LinkCardItem` the card takes, so a new host binds a `FeedLink`, a
  `PublicSocialMediaLink` or a hand-built fixture straight in, and its internals (`expanded`
  collapsed by default, the affordance gate on `threadLinks.length > 0`, its own `totalCount`) mean
  a host cannot accidentally re-decide any of them. **Its count is `threadLabel`, not a copy of it**
  — `groupLabel = computed(() => threadLabel(totalCount()))` is the component's only pluralisation,
  and BOTH strings it shows read that one computed: the visible `link-thread-size` text and the
  toggle's `aria-label`. Its `totalCount` (the server's `threadSize`, falling back to
  `members().length + 1`) chooses only WHICH number to ask about, never how to phrase it.
  The two kinds of caller genuinely differ, and the difference is in the gate, not the string:
  `threadLabel` must be able to answer `""` because the console table's row and the profile badge
  sit on rows that may be plain unthreaded links and DROP the chip on `""`, whereas the wrapper's
  affordance only renders when `threadLinks.length > 0`, so its minimum is 2 and the `""` branch is
  unreachable there. That is why one helper serves both — and why a future change must not "fix"
  either half: inlining `${n} links` in the wrapper (safe today, so the temptation is real) forks
  the one decision, while narrowing the helper to the wrapper's minimum (drop the `""`, or treat
  `1` as `"1 link"`) would put a chip on every ordinary row in the app. Two further things a future
  change must not "improve" away: the affordance is gated on `threadLinks.length > 0` and **not** on
  `isThreadRoot` (a root is `thread == null`, which is also true of every unthreaded link — see
  `MISTAKES.md`), and the root is rendered through the same `app-link-card` with the same inputs
  (byte-identical DOM to a plain row), so the first link of a group looks exactly like any other
  link. A host that wants threads open, or wants a specific one open, adds an input rather than
  re-deriving the toggle.
- **`link-occurred-at.util.ts` is the single datetime-local ↔ API conversion seam** for the link
  feature. Its contract is the thing to preserve: offset-free in and out, never `toISOString()` on a
  naive wall-time field (that shifts it 8 hours), and a value that does not match the control's shape
  is passed through **unchanged** rather than mapped to `null` — because `null` on the update path
  is a destructive "reset to submission time", so guessing would turn a typo into silent data loss.
- **`linkDisplayInstant(link)` (`occurredAt ?? created`) is the one rule for "which instant does a
  link display".** It is what `groupLinksByDay` buckets on and what the situasi section sorts on, and
  the home feed's `groupFeedLinksByDay` applies the same fallback inline. A new surface that groups,
  sorts or labels links must key on the display instant, not on `created` — otherwise a back-dated
  report scatters one calendar day under two headers and orders differently from the feed above it.
- **`link-thread-selection.util.ts` is the shared selection seam** for any future grouping surface,
  so "may I group this?", "is Select-all checked?" and "does this row show a chip?" cannot drift
  between the admin and submitter experiences. Its immutability contract is load-bearing, not
  hygiene: the results are written back into a signal, where an in-place mutation is invisible to
  change detection.
- Details/photos use an in-place expand/collapse idiom (matching `vehicle-list.component.ts`
  elsewhere in the app) rather than a modal/drawer — consistent with how new expandable sections
  elsewhere in the app should be built.
- The photo-attach path is entirely additive: `PhotoPickerComponent`, `ImageUploadService` and
  `MediaViewerComponent` are shared, feature-agnostic primitives (already reused from
  `features/spotting` and `features/gallery`), so any new "attach evidence" flow elsewhere in the
  app can plug into the same picker/queue/viewer without new infrastructure.
- `InfiniteScrollDirective` is a reusable sentinel (IntersectionObserver + coalescing) — any
  cursor-paginated list in the app can adopt it.

## 💡 Potential Feature Opportunities

- **Extend thread UI to the flat surfaces.** `app-link-thread` is deliberately shipped on the home
  feed and the admin console only; `/insiden`'s Submitted Links tab, the situasi tab, the per-incident
  cards and My Links stay flat and complete, because a reader browsing "everything submitted" would
  lose rows the reader came for. The component is host-agnostic, but a host is **not** a one-line
  swap. Exactly one selection gap has to be closed first, and it is the nested one: the per-incident
  `links(first: 10)` sub-select in `insiden.queries.ts` selects **none** of
  `threadId`/`isThreadRoot`/`threadSize`/`threadLinks` (only
  `id url title occurredAt created status completed`), and the incident card builds its ONE list out
  of that sub-select plus `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` continuations — so page 1 would arrive
  with no thread fields at all. `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` itself (Submitted Links, situasi,
  My Links, incident-card continuations) already selects `threadId`/`isThreadRoot`/`threadSize`, but
  **not** `threadLinks`, which is the field the wrapper expands from. So the real work is: add the
  nested `threadLinks` to both documents, keep the two selection sets in agreement (the existing
  `occurredAt`/`created` pair is kept in sync for exactly this reason), then set
  `collapseThreads: true` on the first page **and** every continuation — and make a deliberate
  decision about `mine`, which the backend never collapses. Deliberately out of scope for this wave,
  not blocked.
- **Client-side filtering by line/vehicle/station/severity:** Ready now — `allIncidents`,
  `dayIncidents`, and `pinned` are already `computed()` signals derived from `incidentsResource`;
  adding a filter-criteria signal and folding it into those `computed()`s is a small additive
  change, since the full ~280-record dataset from `INSIDEN_INCIDENTS_QUERY` is already resident
  client-side and needs no new query or backend work.
- **Calendar export (iCal/.ics):** Ready now — `CalendarIncident` already carries start/end
  datetime, title, and brief per record, enough to generate a standards-compliant `.ics` feed or
  "Add to calendar" action directly from the existing `incidentsResource` data with no schema
  changes.
- **Ongoing-incident subscriptions/notifications:** Good idea, not ready — `pinned` already
  isolates unresolved/long-running incidents and `IncidentCardComponent.isOngoing()` already flags
  active ones, so the client-side targeting logic exists. Context for future LLMs: there is no
  push-notification service or per-user subscription record anywhere in the app or backend today;
  this would need a new delivery mechanism (e.g. an FCM topic or backend-triggered webhook) and a
  backend "subscribe to incident" mutation/model before any frontend work is possible.
- **Shareable/deep-linkable incident state:** Partially ready — day selection already round-trips
  through the URL (`daySelected` → `router.navigate(["/insiden", dateKey])`), but per-incident UI
  state (`detailsExpanded`, `photosExpanded` in `IncidentCardComponent`) is local component signal
  state, not reflected in the URL. Extending the route with an incident-id fragment/query param
  synced to those local signals is a moderate, self-contained change confined to
  `InsidenPage`/`IncidentCardComponent`.
- **Paginated/incremental incident loading:** Partially ready — the backend `calendarIncidents`
  field now accepts `ongoing` and `date` (interval-overlap) filters, and the per-incident link
  lists are cursor-paginated, but the incidents query itself is still a single unfiltered
  client-side fetch of the entire dataset (~280 records). Introducing server-side pagination for
  the incidents list requires a backend resolver change (limit/offset or cursor args on
  `calendarIncidents`) before the frontend can request a bounded window.

## 💡 Potential AI Feature Opportunities

- **Automated incident summarization/triage:** `brief`, `details`, and ordered `chronologies[]`
  are already structured, timestamped text — a natural fit for an LLM-generated plain-language
  summary of "what happened and current status," or auto-classifying `severity`/`impactFactor`
  from free-text admin input at creation time. The form already ships Gemini extract/summarize
  flows (`IncidentAiService` → Firebase functions), so the plumbing exists.
- **Anomaly/pattern detection over historical incidents:** the full incident dataset (lines,
  vehicles, stations, severity, duration) is already fetched client-side in one shot, making it a
  ready substrate for a recurring-disruption or "this line has had N incidents this month" insight
  surfaced alongside the calendar, without any new data-fetching infrastructure.
- **Smart photo/evidence assistance:** the existing photo-attachment pipeline (`PhotoPickerComponent`
  → `ImageUploadService` → `MediaViewerComponent`) is a ready hook for AI-assisted captioning,
  duplicate/blur detection, or auto-tagging uploaded incident photos before they're queued, reusing
  the same queue/compression flow already in place.
