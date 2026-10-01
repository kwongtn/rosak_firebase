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
    with `canEditLink`, author or admin). Plus the **conversation** inputs, added with the nested-thread
    work: `sublinkCount = input(0)`, `sublinksExpanded = input(false)`, and the
    `sublinkToggle = output<void>()` output (see Internal State for why the count is an INPUT and not
    read off `link`).
  - `LinkThreadComponent` (shared `app-link-thread`, the **recursive** conversation wrapper):

    | member        | kind             | meaning                                                                                                                                                                                                             |
    | ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `link`        | `input.required` | the node THIS instance renders — a host's conversation root, or a direct child reached through the recursion. `LinkCardItem`, so every host node binds straight in.                                                 |
    | `userVote`    | `input`, `null`  | scalar optimistic-overlay vote, for a **host-rendered** root only. `null` (the default) = "not supplied", so a `0` cannot masquerade as "the host removed my vote". **Not forwarded to nested levels** (see below). |
    | `voteValues`  | `input`, `{}`    | the host's per-link vote overlay keyed by id. Forwarded to **every** card at **every** depth — a sublink is votable too.                                                                                            |
    | `editable`    | `input`, `false` | show the edit pencil — forwarded down the recursion, so a sublink gets one too.                                                                                                                                     |
    | `voteChanged` | `output`         | `{ id, value }` — the **voted** node's own id, at any depth.                                                                                                                                                        |
    | `edit`        | `output`         | the clicked **descendant's** own `LinkCardItem`, never the root's.                                                                                                                                                  |

    **Recursion, not a branch component.** The component lists **itself** in `imports`
    (`[LinkCardComponent, LinkThreadComponent]`), which Angular supports for standalone components:
    the class binding exists by the time the decorator runs, and AOT resolves the self-reference
    statically. The usual first instinct is to extract a sibling `app-link-branch`; that was not
    needed here and would have left two definitions of "a node plus its children" free to drift.
    Verified under both the vitest builder and AOT (`npm run build` exit 0).
    **No depth parameter exists in this file** — the write side caps at `MAX_THREAD_DEPTH = 3` and the
    read side is bounded by what the query fetched, so a leaf is simply a node with no `sublinks`.

  - `VoteButtonComponent`: `targetType = input<"incident" | "chronology" | "link">("incident")` — the
    same button drives incident, chronology and social-media-link votes (the shared link card hosts
    it with `targetType="link"`).
    🔴 **The displayed state is three layers, not a `linkedSignal`.** `optimistic` (the in-flight
    projection from `nextVoteState`) → `confirmed` (the snapshot the mutation acknowledged with) →
    `hostState` (the inputs). A `linkedSignal` re-seeds from its inputs on ANY change, and the host
    writes the acknowledged `userVote` straight back down as its overlay — so the control reset to
    the PRE-CLICK `netScore` and the arrow stayed lit. `confirmed` is honoured only while
    `voteStatsKey(hostState())` still matches the triple it was computed against, and that key
    deliberately **excludes `userVote`**: the host echoing our own value is not new data, while a
    real refetch (the home feed polls) moves the counters and correctly supersedes the snapshot.
    All six mutations acknowledge with the same `VoteMutationPayload` shape
    (`userVote`/`voteScore`/`upvotes`/`downvotes`; `ok` is sent but never read — a rejected request
    is the failure signal), and `voteStateFromAcknowledgement` degrades any field that is not a
    finite number to the fallback, so a partial payload keeps the projection rather than painting
    `undefined`.
- **Outputs / Events / API Responses:**
  - `IncidentCalendarComponent.daySelected = output<string>()` — emits a `dateKey` on day click,
    "Today", month/year jump commit, or prev/next-month navigation; `InsidenPage` reacts by calling
    `router.navigate(["/insiden", dateKey])`, keeping the viewed day a real, shareable URL rather
    than local-only UI state.
  - `LinkCardComponent.voteChanged = output<{ value: number }>()` — after a successful vote (the
    link-list host records it in its `voteValues` overlay); `edit = output<LinkCardItem>()` — the
    edit pencil, host-gated with `canEditLink`; `sublinkToggle = output<void>()` — the conversation
    affordance was clicked. The card has **no idea** what will be revealed; it only reports the click.
    `LinkListComponent.voteChanged` re-emits it with the voted link's id as
    `{ id: string; value: number }`.
  - `LinkThreadComponent.voteChanged = output<{ id: string; value: number }>()` — the same re-emit,
    with the id added, because one thread renders N cards per row and every one of them is votable;
    `edit = output<LinkCardItem>()` re-emitted with the clicked **descendant's own** `LinkCardItem`
    at whatever depth it lives, because that object is what the host's edit sheet hydrates from and
    a wrong one would open the wrong link.
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

  - **The conversation TREE on `LinkCardItem`** (backend `SocialMediaLinkScalar`; a link is either a
    root or a sublink of another link, and a sublink can have sublinks of its own). Fields renamed
    with the nested-thread work, and **none of the old names survives** — there is no server-side
    alias, so a stale spelling is a hard "Unknown field" on the whole query:

    | `LinkCardItem` (current)    | replaced         | meaning                                                                                                                                                                                                                                 |
    | --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `parentId?: string \| null` | `threadId`       | the link this one hangs under; `null` **exactly** when it IS a root                                                                                                                                                                     |
    | `isThreadRoot?: boolean`    | (unchanged name) | 🔴 a **ROOT MARKER**, true of every ordinary ungrouped link too — never an affordance gate                                                                                                                                              |
    | `sublinkCount?: number`     | `threadSize`     | this node's OWN publicly-visible descendants **at any depth**; `0` for a leaf. **NOT** the conversation size                                                                                                                            |
    | `sublinks?: LinkCardItem[]` | `threadLinks`    | this node's **direct** children, in stored sibling `position` order. **Recursive**: the element type is the interface itself                                                                                                            |
    | (added)                     | —                | `position?: number` lives on the _row_ types (`PublicSocialMediaLink`, `SocialMediaLinkRow`) — the gap-spaced `10, 20, 30, …` sibling rank, selected by both flat documents so a reorder permutation can be built from the STORED order |

    Four properties of these fields, all of which a caller gets wrong at least once:
    - **Optional by design.** All four are optional on `LinkCardItem` because the flat surfaces do not
      select them and a narrower host selection must still satisfy the contract. `created` stays
      **required** alongside them: a nested child is itself a `LinkCardItem`, so a document that
      forgets `created` at depth 2 fails the same contract the root does — which is the point of the
      recursive type. The console's own `SocialMediaLinkRow` is the opposite case: it selects all
      four, so there they are **required**.
    - **`sublinkCount` is not a conversation size.** Read the ROOT's count to size a conversation;
      never sum the column level by level — every node answers for itself and the recursion
      terminates on `0`, so a sum double-counts by exactly the depth (root 2, child 1, leaf 0 → 3 for
      a 3-link tree).
    - **`sublinks` order ≠ every other link list's order.** It is `position` ASC, author-chosen and
      not a timeline; every other list in the app is `occurredAt DESC, id DESC`. A group's members
      need not be contiguous in time.
    - **A conversation is public iff its ROOT is**, and the time windows resolve across the whole
      subtree — so `sublinkCount`/`sublinks` count and list only **publicly-visible** descendants, and
      a hidden sublink is not listed even on your OWN `mine` page. The asymmetry that survives is
      moderation, which is root-only: hiding a middle node leaves it attached to the tree but takes it
      (and its own descendants) out of both the count and the list.

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
    submission time and the rest by event time. 🔴 And **both** documents must stay
    **tree-free**, which is what keeps the shared card's conversation chip off this surface: the rows
    here are not `app-link-card` at all (they are the compact `[datetime] favicon title` anchors, so
    there is no host to render a chip in), and neither the nested sub-select nor the continuation
    document selects any tree field. Keeping page 1 and the continuation pages in agreement about
    being flat is the same two-document hazard one field over, and
    `incident-card.component.spec.ts` pins both sides. Pending rows with an amber clock icon + "Pending
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
    conversation-free**: neither the first-page resource nor `loadMore` sends `collapseThreads`, so
    every sublink stays a row of its own. Nested-conversation UI is scoped to the home feed and the
    two management surfaces, and this tab is a browsable "everything submitted" view where hiding
    sublinks behind a root would lose rows the reader came for. Omitting the key (rather than sending
    an explicit `false`) is how the tab says "use the schema default" — an explicit `null` is fatal
    on a `Boolean!` argument.
    🔴 **Why no card here ever shows a "N links" chip — two independent facts, either one sufficient,
    and both pinned by this host's spec:** (1) `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` does not select
    `sublinks`, so a row carries no expansion for a chip to reveal; (2) `app-link-list` renders
    `app-link-card` **without binding `[sublinkCount]`**, and the card gates on that INPUT (never on
    `link.sublinkCount`, which this document _does_ select as a plain fact). Adding the tree fields
    to the shared list would be a product change, not a refactor, and the spec fails the moment it
    happens. Rendering is delegated to the shared `LinkListComponent` (see insiden shared components);
    this host only owns pagination and reload-on-sheet-close (dropping appended continuation pages of
    the stale dataset).
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
    and a right rail carrying the vote button, the relative time and the edit pencil (the
    conversation chip now sits in the chip row, beside the line/Official chips).
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
    The `<a>` is a stretched overlay (`absolute inset-0`) across the left column, not a wrapper
    around the body: the visible body and chip row are `pointer-events-none` layers above it, and
    every interactive control (vote, conversation toggle, edit pencil) is a SIBLING of the anchor —
    the toggle re-enabling hit-testing with `pointer-events-auto` — so their clicks can never
    navigate while the chips and the title still open the link. Test ids: `link-url-domain` / `link-url-path` (the split URL),
    `link-tags`, `link-pending`, `link-official`, `link-meta-rail`, `link-thread-toggle` /
    `link-thread-size` / `link-time` / `link-created` / `link-submitted`, `link-submitter` and
    `link-edit`. The host passes `userVote` (its authenticated overlay wins over the anonymous feed
    value) and `editable` (gated with `canEditLink`); the card re-emits votes as `voteChanged` and the
    edit pencil as `edit`.
    **The conversation affordance lives in the card** (moved here with the nested-thread work): a
    chevron plus a readable "N links" button (`data-testid="link-thread-toggle"` /
    `link-thread-size`, `aria-expanded`, and an action-naming `aria-label` — "Show/Hide the other
    links in this thread (N links)"). Four facts, all load-bearing:
    - **The gate is `sublinkCount > 0`** (`hasSublinks`), never `isThreadRoot` — see the trap below.
    - **`sublinkCount` is an INPUT, not read off `link`.** `LinkCardItem.sublinkCount` is optional
      precisely because the flat hosts do not select it, and those hosts must not grow a chip. The
      input defaults to `0`, so a flat host that passes nothing gets no affordance even when its nodes
      carry a real count. `NaN > 0` is `false`, so a bad fixture degrades to "no chip" rather than to
      "NaN links".
    - **The label is `threadLabel(sublinkCount() + 1)` and the `+ 1` is load-bearing** — see the
      off-by-one below.
    - **The CHIP ROW, beside Pending/Official — via a stretched link.** The chip row used to be
      inside the `<a>`, where a `<button>` is invalid HTML whose click also navigates, which is why
      the affordance sat in the right rail instead. The anchor is now an `absolute inset-0 z-0`
      OVERLAY across the whole left column, with the visible body and the chip row as
      `pointer-events-none` layers on top of it (`relative z-10`) and the toggle opting back in with
      `pointer-events-auto`. So the chip row is a SIBLING of the anchor — which is what "controls are
      siblings, never children" actually requires — and the chips stay clickable, because a click on
      a `pointer-events-none` chip falls through to the anchor underneath. This supersedes the earlier
      "the right rail, not the chip row" placement.
      Two costs of the overlay, both deliberate and both stated in the component header: (1) an
      element under an overlay cannot have a hover tooltip, so the chips' `title` explanations (the
      line's full name, "awaiting admin approval", the Official provenance note) became `sr-only`
      text — where they were doing their real work anyway; (2) the title is no longer selectable by
      dragging, the same trade Bootstrap's `.stretched-link` makes. The link's accessible name is now
      explicit (`anchorLabel()`: title, then the raw URL) because the overlay no longer wraps the
      visible text.
      The card does **not** own the expansion state or the children: `app-link-thread` holds one
      `expanded` signal per level and renders the nested cards. That split is what lets the same card
      serve a flat host (no input bound → no chip, no wiring) and every depth of a tree, with no depth
      parameter anywhere in the file.
  - `LinkThreadComponent` (shared, `app-link-thread`): the **recursive** conversation wrapper, and the
    **named extension point for any grouped row**. Structure: one `<app-link-card>` for this node,
    then — only when `expanded() && children().length > 0` — a
    `data-testid="link-thread-members"` container (`border-l pl-3`: the indent plus the left rule)
    holding one nested `<app-link-thread>` per child, `track child.id`. The container renders **only
    when there is something in it**, so a host that supplies a count without the nested selection (or a
    leaf whose count is `0`) leaves no empty rule behind and the chip stays the only trace of the
    affordance.
    - `children = computed(() => link().sublinks ?? [])` — this node's **direct** children, in the
      server's stored sibling `position` order. `?? []` because `sublinks` is optional: the flat
      surfaces do not select it, a spec fixture may omit it, and `strict`/`strictNullChecks` are OFF.
    - `sublinkCount = computed(() => link().sublinkCount ?? 0)` — handed to the card, which decides
      whether to draw the chip. `?? 0` for the same optionality reason: an absent count means "this
      host did not select it", which is exactly "draw no chip".
    - `expanded = signal(false)` — **collapsed by default, per level and independently** (one
      signal per component _instance_, which is what "each level expands on its own" means). Same
      pattern and same reasoning as `app-link-list`'s "Pending (N)" section: a conversation stays out
      of the way until a rider asks for it.
    - `voteFor(link)`: the host's keyed `voteValues[id]` → the root's scalar `userVote` (**this node
      only**, and only when the host supplied one) → `link.userVote ?? 0` — identical to
      `app-link-list`, so a link can move between a flat list and a conversation without changing how
      its vote renders. 🔴 `userVote` is deliberately **not** forwarded to nested levels: it is
      an unkeyed number for "this row", and a nested instance would apply it to ITSELF (`voteFor`
      matches `link.id === this.link().id`), painting the root's optimistic vote onto a child.
      `voteValues` is keyed and therefore safe at every depth.
    - 🔴 `editable` **is** forwarded to every level, and `edit` re-emits the clicked
      descendant's own `LinkCardItem`. This **supersedes** the previous wave's rationale ("a collapsed
      group is a summary, and the host's edit flow is root-driven"), which was defensible and wrong for
      the product: a conversation is a set of ordinary, individually-approvable links, and a rider who
      timestamped the follow-up photo is exactly the person who should be able to fix its wording.
      ⚠️ `editable` is ONE boolean for the whole conversation, so a host that computes it from
      the ROOT (which the home page does, via `canEditLink(root)`) also grants a pencil on a sublink
      somebody else submitted. That is a **cosmetic over-permission only** — exactly as
      `canEditLink`'s own docstring says, the backend re-checks permission on the target link and
      rejects the write. Per-link authorship would need a predicate input; no host asks for one, so it
      is deliberately absent rather than speculatively added.
    - **The appearance rule is unchanged and still the point:** the root renders through the same
      `app-link-card` with the SAME inputs as a plain list row — no wrapper class, no bold, no badge,
      no size change — and the spec asserts `outerHTML` parity between a threaded and an unthreaded
      root. The only legitimate difference is the one extra chip in the card's own rail, which the
      card itself owns. If the first link of a conversation looked different from every other link, the
      feed would grow a second visual hierarchy for no gain — a product decision, not an oversight.
      SSR-safe: no browser APIs.
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
  - `link-thread-selection.util.ts` (`toggleSelection`, `areAllSelected`, `canGroup`, `canNest`,
    `selectedWithin`, `threadLabel`) — the selection mechanics of the two grouping surfaces (the
    console triage table and the profile's "My Submitted Links"). Every function is a total,
    immutable function of its arguments (no Angular, no `signal`, no RxJS) and returns a NEW array,
    because the results are fed straight back into a signal: mutating in place yields the same
    reference, change detection never fires, and the checkbox silently stops updating. The two
    minimums are separate on purpose — `canGroup` needs two (an untargeted one-link call elects that
    link as its own root) while `canNest` needs one (with a target, that link becomes a real child).
    `threadLabel`
    is the **single place pluralisation is decided for a link conversation anywhere in the app**, and
    its remit is **wider than those two surfaces** — its documented consumer list is exactly:
    1. the console triage chip (`/console/links`), whose thread cell falls back to an em dash
       on `""`, plus `confirmThreadCoupling`;
    2. the "My Submitted Links" badge on the profile page;
    3. `app-link-card`'s in-card indicator (`conversationLabel = threadLabel(sublinkCount() + 1)`),
       which both the visible chip and the toggle's `aria-label` read.

       ⚠️ **`app-link-thread` is NOT on that list.** The wrapper used to call the helper itself
       (`groupLabel = threadLabel(...)`); the indicator **moved into the card**, so the card owns the
       chip and the wrapper just renders cards. A consumer list that still names the wrapper sends the
       next reader to grep the wrong file, which is why the helper's docstring says to **re-derive the
       list from the code** rather than extend it from memory.

       No consumer may grow its own `${n} link${n === 1 ? "" : "s"}` — that is exactly how one surface
       ends up saying "1 links" while another says "2 link", which no type and no test can catch on its
       own. INVARIANT: a new conversation count joins the helper. What legitimately differs between
       sites is the **gate** that decides whether a count is shown at all, not the string. And
       🔴 **`threadLabel`'s parameter is a CONVERSATION SIZE — `sublinkCount + 1` — not a descendant
       count.** It answers `""` for anything `<= 1`, so passing a raw `sublinkCount` **silently
       deletes the chip on a root with exactly ONE sublink** (`1` → `""`) while every leaf stays
       correctly chip-less (`0` → `""`), which is precisely why the bug hides. All three consumers had
       to rediscover that `+ 1` independently. Do not "tighten" the `""` branch either (`1` → `"1
link"`): a chip would then sprout on every ordinary row in the app.

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
- **`app-link-thread` is the named extension point for any grouped link row, and it is RECURSIVE.**
  It takes the same structural `LinkCardItem` the card takes, so a new host binds a `FeedLink`, a
  `PublicSocialMediaLink` or a hand-built fixture straight in, at any depth. Its internals
  (`expanded` collapsed by default **per level**, the affordance gate on `sublinkCount > 0`, the
  per-level `sublinks` recursion) mean a host cannot accidentally re-decide any of them.
  - **Keep the self-reference.** It lists itself in `imports`; that works under both the vitest
    builder and AOT, and the first instinct — extract a sibling `app-link-branch` — would have
    produced two definitions of "a node plus its children" free to drift. Verified in this repo.
  - **The card owns the chip, the wrapper owns the state.** The card's gate is
    `sublinkCount > 0` on its own INPUT, and the card's label is
    `threadLabel(sublinkCount() + 1)`. The wrapper passes the count through and never reads
    `isThreadRoot` and never pluralises anything. A host must not bind `[sublinkCount]` on
    `app-link-list` unless it has a nesting to reveal: that is what keeps `/insiden`, the situasi tab
    and the incident cards flat.
  - **`editable` is forwarded to every level on purpose** (see the superseded rationale above), and
    the re-emitted `edit` carries the clicked descendant's own `LinkCardItem`. A host that computes
    `editable` from the root over-grants a pencil one level down; that is a cosmetic over-permission
    the backend rejects, and the alternative (a per-link predicate input) has no caller.
  - **Do not "improve" the root's presentation.** It renders through the same `app-link-card` with
    the same inputs (byte-identical DOM to a plain row apart from the one rail chip), so the first
    link of a conversation looks exactly like any other link; bolding, badging or resizing it would
    grow a second visual hierarchy in the feed for no gain.
  - `MAX_THREAD_DEPTH` (the server's write-side cap) is **not** mirrored here. The read side is
    bounded by what the query fetched, so a host asking for deeper nesting simply gets `[]`; a client
    that mirrors the cap silently loses a level the day the cap moves. A host that wants conversations
    open by default, or one specific one open, adds an input rather than re-deriving the toggle.
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

- **Extend thread UI to the flat surfaces — still open, and narrower than it was.** `app-link-thread`
  is deliberately shipped on the **home feed** (today + Last Week) and the two management surfaces
  (the console triage table and My Submitted Links, both of which show hierarchy as an _indent_ in a
  flat list rather than as an expansion). `/insiden`'s Submitted Links tab, the situasi tab and the
  per-incident cards stay flat and complete, because a reader browsing "everything submitted" would
  lose rows the reader came for, and a per-line filter wants a complete list of reports about that
  line. The component is host-agnostic and now recursive, so a host is closer than it was — but it is
  still **not** a one-line swap, and the remaining work is entirely about **selections**:
  1. `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` (Submitted Links, situasi, My Links, incident-card
     continuations) selects `parentId` / `isThreadRoot` / `sublinkCount` / `position` but
     **deliberately not `sublinks`**, which is the field the wrapper expands from.
  2. The per-incident `links(first: 10)` sub-select in `insiden.queries.ts` selects **no** tree field
     at all (only `id url title occurredAt created status completed`), and the incident card builds its
     ONE list out of that sub-select **plus** continuation pages from the document above — so page 1
     would arrive with no tree fields while the rest of the list had them. That two-document hazard is
     the same one the `occurredAt`/`created` pair already documents, one field over, and it is pinned
     by `incident-card.component.spec.ts` on **both** documents.

  So the real work is: add the nested `sublinks` to both documents (to the depth to be shown), keep
  the two selection sets in agreement, then set `collapseThreads: true` on the first page **and every
  continuation** — and make a deliberate decision about `mine`, which the backend never collapses
  (a submitter must never lose their own sublinks behind a root). Each flat host's spec currently
  **fails** if the tree leaks in, so closing this gap is a deliberate, spec-visible product change and
  not a refactor. Deliberately out of scope for this wave, not blocked.

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
