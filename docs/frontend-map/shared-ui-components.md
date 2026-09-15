# Shared UI Component Library (`@ui`)

## Path(s) & Routing

Not applicable — everything under `src/app/@ui/**` is a library of presentational/reusable components, not a routed page. Nothing here has its own URL, guard, or `<title>`. This document is the **canonical reference** for each shared component's own inputs/outputs/behavior; the per-feature docs in this same directory (`spotting.md`, `situasi.md`, `tracker.md`, `gallery.md`, `profile.md`, `console.md`, `insiden.md`) link back here by component name instead of re-explaining these components.

## Purpose

`src/app/@ui/**` is this app's shared, cross-feature component library: small, mostly "dumb"/presentational components (status tags, table-cell renderers, image grids, calendar-heatmap charts) that many otherwise-unrelated feature areas (spotting, situasi, console, profile, insiden) all import directly by file path — there is no barrel/index module (confirmed: no file re-exports the whole `@ui` tree, and no `from "src/app/@ui"` import exists anywhere). Roughly two-thirds of these components are pure "given this input, render this markup" components with no data-fetching of their own (the four status/type tag components, the two cell-display components, `image-grid`, `footer`, `action-list`); the rest own their own GraphQL query or REST call (`spotting-image-list`, both calendar-heatmap components, `vehicle-status-history`, `verification-code-card`). Every component here currently renders through ng-zorro-antd (`nz-tag`, `nz-card`, `nz-spin`, `nz-image`, `nz-upload`, `nz-drawer`, etc.) plus either empty or minimal custom SCSS — the Tailwind rewrite's job is to reproduce the same _behavior_ (color-coding rules, layout algorithms, responsive breakpoints, hover/loading states) without ng-zorro's component internals.

**A shared color-rendering fact used by four components below** (`LineStatusTagComponent`, `SpottingTypeTagComponent`, `VehicleStatusTagComponent`, `WheelStatusTagComponent`): every one of them wraps a single ng-zorro `<nz-tag [nzColor]="...">` chosen by a `@switch` over an enum-like string. `nzColor` values here are always one of ng-zorro's **named preset colors** (`blue`, `green`, `cyan`, `yellow`, `red`), which render as a **light-tinted background + colored border + colored text triplet — not a solid fill** (confirmed by reading the actual compiled selectors in `src/nz-zorro.scss`, which is checked into this repo and wired directly into the Angular build via `angular.json:40,140` — i.e. these are _not_ generated fresh from ng-zorro's Less at build time, `nz-zorro.scss` is a static, pre-compiled snapshot):

| `nzColor` | text      | background | border    |
| --------- | --------- | ---------- | --------- |
| `blue`    | `#096dd9` | `#e6f7ff`  | `#91d5ff` |
| `green`   | `#389e0d` | `#f6ffed`  | `#b7eb8f` |
| `cyan`    | `#08979c` | `#e6fffb`  | `#87e8de` |
| `yellow`  | `#d4b106` | `#feffe6`  | `#fffb8f` |
| `red`     | `#cf1322` | `#fff1f0`  | `#ffa39e` |

Every `@default` fallback case across these four components instead sets `nzColor="var(--devui-text-weak)"` — a theme-aware CSS custom property (`#575d6c` light / `#a0a0a0` dark, `src/styles.scss`) — rendering a plain grey/muted tag with **no** light-tint/border treatment (that styling only applies to the named presets above; an arbitrary CSS-variable `nzColor` just sets `color`+`border-color` directly with a transparent-ish default background per ng-zorro's own fallback rule). **Critically, the five named-preset colors above are compiled once, light-theme-only** — grepping `src/nz-zorro.scss` finds exactly one `.ant-tag-blue`/`.ant-tag-green`/etc. rule each (no dark-mode duplicate), and no `NZ_CONFIG`/dark-algorithm setup exists anywhere in this app. So **today, every tag using a named preset color looks identical in light and dark theme** — only the grey `@default` fallback (via the `--devui-text-weak` variable) actually flips with the theme toggle. A Tailwind rewrite must decide, consciously, whether to preserve that (visually flat, non-theme-aware) status quo or finally make these tag colors dark-mode-aware — see Open Questions.

---

## ActionListComponent

**Files:** `src/app/@ui/action-list/action-list.component.{ts,html,scss,spec.ts}` — standalone, selector `ui-action-list`.

### Purpose

A live, **client-only, non-persisted** "recent activity in this browser tab" list. It fetches nothing from the backend itself — it subscribes to the app-wide `SessionHistoryService` (`src/app/services/session-history.service.ts`, `providedIn: "root"`, a `BehaviorSubject<IHistoryStore>` that starts empty and is never written to `localStorage`/backend) and renders whichever entries match a caller-supplied filter. Its only real-world use is inside the spotting-submission form, giving the user immediate visual confirmation of everything they've submitted in the current session without a refetch.

### Inputs / Outputs

- `@Input() filter: string[] = ["spotting"]` — restricts which `historyType` entries are actually shown. `THistoryStore` currently has two possible values, `"spotting"` and `"mediaUpload"` (`session-history.service.ts:5`), but a repo-wide grep for `addSessionHistory(` finds **only one call site in the entire app** (`spotting/spotting-main.component.ts:191-197`, always with type `"spotting"`) — `"mediaUpload"` has no producer anywhere; it's a currently-unused/reserved value.
- No `@Output()`.

### Rendering & styling — behavior to preserve

- Wrapped in ng-zorro `<nz-list nzBordered nzSize="small">` (`NzListModule`) / `<nz-list-item>` per entry. The outer `@for` iterates **every** entry in `historyStore` regardless of `filter` (html:3-6); an inner `@if (filter.includes(hist.value['historyType']))` (html:8) is what actually hides non-matching rows — filtering is presentational-only, not a data-level slice.
- Each visible row: **left** — an `<a>` linking to the Django-admin edit page for that event, `{environment.backendUrl}admin/spotting/event/{id}` (ts:34, html:12-17), with **no `target="_blank"`** — clicking it navigates the current tab _away from the Angular SPA_ into Django's admin UI, which requires a separate Django-admin login, not the user's Firebase session. Followed by a literal `" - "` (kept non-collapsing via `.require-whitespace { white-space: pre }`, scss:1-3) and `{{ hist.value['vehicle']['name'] }}`. **Right** — a `<spotting-type-tag>` and a `<vehicle-status-tag>` (both documented below) inside an `<nz-space>` (`*nzSpaceItem` gives horizontal gaps); all actual status/type color-coding lives in those two child components, not here.
- `.flex-container { width: 100vw; ... }` (scss:5-19) — likely a **bug**, not intended behavior: `100vw` is the entire browser viewport width, ignoring whatever the component is actually embedded in. Its sole consumer renders this inside `spotting-form`'s own layout, which can itself sit inside a drawer as narrow as `280px` (see `ImagePreviewButtonComponent`'s breakpoints below) — a rewrite should treat this as something to _fix_ (use `100%` of the parent) rather than faithfully reproduce.
- **Ordering quirk**: the template's `keyvalue` pipe (html:4) passes no custom `compareFn`, so Angular's default ascending-by-key string sort applies. Entries are keyed by `Date.now()`-style millisecond epoch timestamps (`session-history.service.ts:27`); ascending-by-key means **oldest entry first**, even though `addSessionHistory` unshifts each new entry to the _front_ of the underlying plain object (`session-history.service.ts:26-32`). If the intended UX is "most recent submission at the top" (the more typical activity-feed convention), this is currently backwards — verify against the live site before deciding whether to preserve or fix in the rewrite.
- No animations, no responsive breakpoints beyond the `100vw` issue above.

### Consumers (call sites)

- **Only one** in the whole app: `src/app/spotting/spotting-form/spotting-form.component.html:538`, `<ui-action-list [filter]="['spotting']">`, under the static heading "As of Current Session, you added the following entries" (`spotting-form.component.html:536`).
- Entries are produced by `src/app/spotting/spotting-main.component.ts:191-197`: `sessionHistoryService.addSessionHistory("spotting", {...formData, id: submissionData?.data.addEvent.id})`, fired right after a spotting submission succeeds — `formData` supplies the `vehicle`/`type`/`status` fields the template reads.

---

## FooterComponent

**Files:** `src/app/@ui/footer/footer.component.{ts,html,scss,spec.ts}` — standalone, selector `app-footer`.

### Purpose

A tiny, static "build provenance" footer: which frontend git commit + build timestamp, and which backend git commit + build datetime, are currently live, plus a one-line GNU AGPLv3 credit/link. Purely informational — not interactive.

### Inputs / Outputs

None — no `@Input`, no `@Output`. It reads two sources internally:

- `build` default export from generated `src/build.ts` (frontend version/timestamp/git hash, regenerated by the project's build tooling — a real deploy replaces the placeholder `git.hash: "<<This is a test build>>"` seen in the checked-in dev copy).
- `BuildInfoService.backendBuildInfo` (`src/app/services/build-info.service.ts:17-24,53-58`) — a `BehaviorSubject` seeded with a placeholder `{hash: "...", datetime: "..."}` and updated once via a plain `HttpClient.get(environment.backendUrl + "version/")` fired from the service constructor. **The footer can briefly render the literal string `"..."`** for the backend hash/datetime before that request resolves.

### Rendering & styling — behavior to preserve

Plain semantic `<footer><div class="copyright">...</div></footer>` — no ng-zorro components at all. Only CSS: `.copyright { text-align: center; margin: 0 auto; }`. No color logic, no breakpoints, no animation — this is the simplest component in the whole `@ui` tree; ports to a couple of Tailwind utility classes with essentially zero behavior-loss risk.

### Consumers (call sites)

- **Global app shell**: declared in `app.module.ts`, rendered at `app.component.html:35-40` inside `@if (applyPadding) { <div class="footer"><hr/><app-footer></app-footer></div> }`. `applyPadding` (`app.component.ts:66,190-192`) is forced `false` for the route keys `"situasi"` and `"tracker"` (`noApplyPaddingRoutes`, `app.component.ts:52`) — so the global shell's footer (and its `<hr/>`) is suppressed on those two routes.
- **`situasi`** renders its **own separate** `<app-footer>` instance inside its own `nz-layout`'s `<nz-footer>` (`situasi/situasi.component.html:242-247`, imported via `situasi/situasi.module.ts`) — situasi has a fully custom full-page layout independent of the main `AppComponent` shell, so it needs (and gets) its own footer placement.
- **`tracker`** is also in `noApplyPaddingRoutes` but has **no** `app-footer` usage anywhere under `src/app/tracker/**` — confirmed by a repo-wide grep for `app-footer`/`FooterComponent` that surfaced only the three locations above. So `/tracker` currently renders **no footer at all**.

---

## ImageGridComponent

**Files:** `src/app/@ui/image-grid/image-grid.component.{ts,html,scss}` + `image-grid.module.ts` (`NgModule`-declared, **not** standalone). Selector `image-grid`.

### Purpose

A reusable "Imgur-style masonry" photo grid: lays out a set of already-fetched images at their true aspect ratio in flowing rows (no cropping), and opens a full-screen lightbox on click. Fully data-agnostic — the caller owns the GraphQL/REST query and hands it a pre-built array; this component does no fetching of its own.

### Inputs / Outputs

- `@Input() images: InputImage[] = []` — `InputImage = { url, thumbnailUrl, width, height, display }` (ts:14-20). `width`/`height` are the image's **original pixel dimensions**, required because they directly drive each tile's `flex-grow`/`width`.
- `@Input() ratioBaseline: number = 200` — target row height in px; each tile's width = `(img.width * ratioBaseline) / img.height`.
- `@Input() fillLastRow: boolean = true` — toggles a `.fill-last-row` class that forces the trailing filler pseudo-element to occupy ≥20% width, so a short last row doesn't visually stretch one tile to fill it.
- `@Output() onComponentDimensionChange: EventEmitter<[number, number]>` — emits `[offsetWidth, offsetHeight]` of the grid container **exactly once**, in `ngAfterViewInit` (ts:49-54) — not a live `ResizeObserver` stream; a consumer relying on this for responsive re-layout gets only the initial measurement.

### Rendering & styling — behavior to preserve

- **Layout algorithm** ("Imgur thumbnail grid" trick, credited in an HTML comment to `github.com/xieranmaya/blog/issues/6`): a `flex-wrap` container where every tile's `flex-grow` equals its width/height-scaled ratio, plus a zero-content, `flex-grow: 1e4` `::after` pseudo-element that absorbs all leftover space in the last row (scss:3-15) — this is the core masonry visual a Tailwind rewrite must reproduce faithfully (Tailwind has no built-in utility for `flex-grow: 10000`; needs an arbitrary-value class or plain CSS).
- Each tile reserves vertical space _before_ the image loads via a `padding-bottom` percentage spacer (`(height/width) * (ratioBaseline/2) + '%'`, html:24-29) — the classic pre-`aspect-ratio`-property technique; could be simplified with the modern CSS `aspect-ratio` property, but must still produce "no layout jump on load."
- **Hover effect** (scss:41-45): `nz-image-group:hover { box-shadow: 0 2px 12px 0 rgba(37,43,58,0.24); transform: scale(1.05); z-index: 1; }` in light theme; in dark theme (`:root[data-theme="dark"]`, `styles.scss:80-83`) the same rule resolves to `box-shadow: 0 4px 12px 0 rgba(0,0,0,0.72)` — tiles scale up and get a theme-appropriate shadow on hover. This zoom-on-hover micro-interaction (and its theme-aware shadow) must be preserved.
- **Per-tile spinner is actually component-wide**: while `loading` is `true` (a single component-level flag, not per-tile), _every_ tile shows an `<nz-spin nzSimple>` overlay (html:21-23); `loading` flips `false` on the **first** `<img>` `load` event of _any_ tile (`markLoaded()`, ts:66-68) — so the spinner disappears for the **entire grid** as soon as just one image finishes loading, not once all have. Flag this explicitly as existing (probably unintended) behavior rather than silently "fixing" it.
- Broken-image fallback: inline `onerror="this.onerror=null; this.src='./assets/image-not-found.png'"` (html:33, plain HTML attribute, not an Angular binding) swaps in the bundled `src/assets/image-not-found.png`.
- Click → lightbox: `onViewImage(index)` opens ng-zorro's `NzImageService.preview()` (ts:56-64) seeded with **every** image in `this.images` (the whole grid instance), `switchTo(index)` on the clicked tile.
- **Second lazy-viewport tier appears inert**: the `inViewport` directive (`ng-in-viewport`, `rootMargin: '200px 0px'`, html:11-13/ts:70-78) populates `displayImage: {[id]: boolean}`, but that map is **never read** in the template — the `<img [src]>` binding is unconditional (html:32). This bookkeeping currently has no visible rendering effect; treat it as unfinished/inert scaffolding, not a rule to reproduce.
- No responsive breakpoints of its own — `ratioBaseline` is a fixed px value; whatever responsiveness exists comes purely from the flex-wrap reflow.

### Consumers (call sites)

- `src/app/gallery/gallery.component.ts`/`.html` — one `<image-grid>` per visible day-bucket (see `docs/frontend-map/gallery.md` for full detail on that feature's own two-tier lazy-render scheme around it).
- `src/app/insiden/event-list/event-card/image-drawer/image-drawer.component.ts`/`.html:28` — one `<image-grid [images]="imageUrls" />` per incident, fed from `GetCalIncidentMediasService`'s `calendarIncidents[0].medias` (`file.url`, `width`, `height`); shows `<nz-empty nzNotFoundContent="No images. Add some?" />` when empty, and **always** renders a `<spotting-form-upload>` beneath it regardless of ownership (see `FormUploadComponent`'s Consumers section for the contrast with the `isMine`-gated pairing used on the spotting side).
- Declared via `ImageGridModule`, imported by the gallery feature and by `insiden/insiden.module.ts`.

---

## LineStatusTagComponent

**Files:** `src/app/@ui/line-status-tag/line-status-tag.component.{ts,html,scss}`. Standalone component. Selector `line-status-tag`.

### Purpose

Color-coded badge for a transit line's operational `LineStatus`. Purely presentational, same pattern as the other three tag components documented in this file (see the shared preset-tag rendering note in this doc's top-level Purpose section).

### Inputs / Outputs

`@Input() lineStatus!: LineStatus` (required; `LineStatus = "TESTING" | "DEFUNCT" | "ACTIVE" | "PARTIAL_ACTIVE" | "PARTIAL_DISRUPTION" | "TOTAL_DISRUPTION"`, defined at `models/query/get-vehicles.ts:6-12`). No output. Label text is hard-coded per case in the template (not piped from a separate `*.pipe.ts` like the other tag components).

### Rendering & styling — behavior to preserve

| LineStatus             | `nzColor`             | Label                           |
| ---------------------- | --------------------- | ------------------------------- |
| TESTING                | `blue`                | "Testing"                       |
| **DEFUNCT**            | _(none)_              | "Defunct"                       |
| ACTIVE                 | `green`               | "Active"                        |
| PARTIAL_ACTIVE         | `cyan`                | "Partially Active"              |
| PARTIAL_DISRUPTION     | `yellow`              | "Partial Disruption"            |
| TOTAL_DISRUPTION       | `red`                 | "Total Disruption"              |
| _(unrecognized value)_ | _(none — `@default`)_ | `{{ lineStatus \| titlecase }}` |

Unlike `SpottingTypeTagComponent`/`VehicleStatusTagComponent`/`WheelStatusTagComponent`, `DEFUNCT` is an explicit `@case` (not a coverage gap falling through to `@default`) — it deliberately renders an uncolored `<nz-tag>`. `line-status-tag.component.scss` is empty.

### Consumers (call sites)

Only one: `spotting/vehicle-type-container/vehicle-type-container.component.html:9-11` (`<line-status-tag [lineStatus]="lineStatus">`), fed from the per-line `lineStatus` field documented in `spotting.md`.

---

## FormUploadComponent & ImagePreviewButtonComponent (`@ui/spotting/`)

This folder groups two tightly-coupled components implementing "attach photos to a spotting event": `ImagePreviewButtonComponent` is the small button shown in event tables/cards which, on click, opens a drawer hosting `SpottingImageListComponent` (its own section below); `FormUploadComponent` is the actual multi-file picker/preview/client-compression widget, reused both inside that drawer and directly by the main spotting-form and by Insiden's image-drawer.

### FormUploadComponent

**Files:** `src/app/@ui/spotting/form-upload/form-upload.component.{ts,html,scss,spec.ts}` — standalone, selector `spotting-form-upload`.

#### Purpose

A drag-and-drop / click-to-browse multi-image picker. Every picked file is (a) turned into an in-memory preview thumbnail immediately, (b) compressed client-side if larger than 9 MB, and (c) held purely in local component state — **nothing is uploaded to the backend from within this component**; it only ever emits the current in-memory file map upward. The actual network upload (multipart POST to `{backendUrl}upload/`) is a separate concern owned by `ImageUploadService` (`src/app/services/image-upload.service.ts`), queued and flushed by whichever parent calls `addToQueue()` — out of this doc's scope.

#### Inputs / Outputs

- `@Input() imageWidth: string = "100px"`, `@Input() imageHeight: string = "100px"` — inline `[ngStyle]` size applied to every preview tile _and_ the upload drop-zone tile itself.
- `@Output() newImageEvent = new EventEmitter<{[key: string]: ImageFile}>()` — fires on every add _and_ every remove, with the **entire current file map** (keyed by original filename), never a delta.
- The exported `ImageFile` class (ts:28-81) is itself part of this component's public surface — `SpottingImageListComponent`, `ImagePreviewButtonComponent`, `insiden/image-drawer`, and `ImageUploadService` all import this _type_ directly from this component's file rather than a shared models file.

#### Rendering & styling — behavior to preserve

- Accepted types are hard-coded: `image/jpeg`, `image/png`, `image/gif`, `image/tiff` (ts:15-26) — a commented-out block lists planned video MIME types (`video/mp4`, `video/x-msvideo`, `video/webm`, quicktime, wmv, matroska, flv), confirming video attachments are a known "someday" feature, not implemented.
- `beforeUpload` (ts:113-126) **always returns `false`**, unconditionally intercepting ng-zorro's `<nz-upload>` (`NzUploadModule`) built-in upload mechanism — files never leave the browser via `nz-upload` itself; it's only used for its drag-and-drop UI chrome (`nzType="drag"`, dashed border) and native file-picker dialog.
- Rejected file type → `ToastService.addMessage("You can only upload images of type image/jpeg, image/png, image/gif, image/tiff", "error")`, file dropped entirely.
- Every accepted file becomes an `ImageFile`: `pushToPreview()` → `ImageCompressionService.ResizeImage(file, 300, 300)` → `FileBlobToDataUrl()`, writing the result into `.buffer` asynchronously — each tile shows an `<nz-spin [nzSpinning]="file.value.buffer === null">` until that resolves, then swaps in the real `<img [src]="file.value.buffer">`.
- Files over `MAX_MEGABYTE = 9e6` bytes get `toCompress = true` and are asynchronously shrunk via `ImageCompressionService.ResizeToSize(file, MAX_MEGABYTE)` (`isCompressed` flips once done) — this only affects the eventual upload payload, not the always-300×300 on-screen preview.
- Long filenames (>16 chars) are truncated to `first12chars + "\n" + next4chars + "..." + extension` (ts:70-79) — an embedded newline splits the name across two visual lines, not CSS `text-overflow: ellipsis`.
- Remove flow: clicking a preview tile shows `nz-popconfirm` ("Are you sure to remove this image?", bottom-placed) before deleting that key and re-emitting `newImageEvent`.
- Styling (`@import "styles/devui-vars.scss"`): `.devui-add-images` tiles are `display:inline-block; margin-right:8px; margin-bottom:50px` — the large bottom margin looks like a leftover from the removed ng-devui component library rather than an intentional gap; verify visually before preserving exactly. The drop-zone additionally gets `border:1px dashed $devui-line`, switching to `$devui-brand` border + `$devui-icon-fill-active` icon color on `:hover`. These `$devui-*` variables already resolve through theme-aware CSS custom properties defined in `src/styles.scss` (light/dark values both exist) — **this drop-zone chrome already flips with the app's dark-mode toggle**, unlike the flat tag colors described in this doc's Purpose section, and that theme-awareness should be preserved.

#### Consumers (call sites)

- Directly, as `<spotting-form-upload>`: `src/app/spotting/spotting-form/spotting-form.component.html` (the main spotting-creation form, no event id yet); `src/app/@ui/spotting-image-list/spotting-image-list.component.html:19-24` (only when `isMine`); `src/app/insiden/event-list/event-card/image-drawer/image-drawer.component.html:34-39` (**unconditionally**, no ownership gate at all — see Open Questions).
- Declared in `SpottingImageListModule` and `insiden.module.ts`.

### ImagePreviewButtonComponent

**Files:** `src/app/@ui/spotting/image-preview-button/image-preview-button.component.{ts,html,scss,spec.ts}` — standalone, selector `ui-spotting-image-preview-button`.

#### Purpose

The compact "📷 N" pill button shown in event tables/cards that both shows an existing photo count for a spotting event and, on click, opens a drawer to view/add photos for that one event. It's the entry point wiring `SpottingImageListComponent` + `ImageUploadService` together for the "existing event, view/add photos" flow.

#### Inputs / Outputs

- `@Input() count!: number` — current photo count (drives the button's icon/label).
- `@Input() eventId!: string` — passed through as `nzContentParams.eventId` to the drawer's `SpottingImageListComponent`, and to `ImageUploadService.addToQueue(eventId, file, "SPOTTING_EVENT")` on submit.
- `@Input() isMine: boolean = false` — gates the drawer's footer (`nzFooter: this.isMine ? this.drawerFooter : undefined`) and the button's idle-state icon. No `@Output()` — side effects go through injected services (`NzDrawerService`, `ImageUploadService`, `ToastService`), not component events.

#### Rendering & styling — behavior to preserve

- Button variant (html:4-22): `nzType="primary"` **unless** `count === 0 && isMine` (then `nzType="text"`, a ghost button) — a not-yet-photographed event you own gets a subtle text button with just a `+`; every other state gets a solid primary pill. When `count > 0`, shows a camera icon + count, plus a literal `+` glyph appended if `isMine` (hinting "click to add more").
- **Responsive drawer width**, recomputed from `document.body.clientWidth` on construction and every `window:resize` (`@HostListener`, ts:58-69) — four fixed JS breakpoints, chosen (per an in-code comment, ts:41-46) to exactly fit N 200px-square tiles side by side:
  - `< 500px` → `280px` (~1 image wide)
  - `500–1023px` → `480px` (~2 images)
  - `1024–1299px` → `700px` (~3 images)
  - `≥ 1300px` → `905px` (~4 images)
    This is a deliberate JS-computed responsive rule (not CSS media queries) a rewrite must reproduce with equivalent logic, or visually match at these exact breakpoints if moving to CSS.
- Drawer chrome (slide-in-from-right, backdrop, `nzTitle: "Image Preview"`) is entirely ng-zorro's `NzDrawerService` — no custom animation in this component.
- On "Upload" (`isMine` only): reads `pendingUploads` directly off the live drawer content-component instance (`drawerRef.getContentComponent()?.pendingUploads`, ts:94-95 — a cross-component reach-through, not an `@Output()`), queues each file via `ImageUploadService.addToQueue`, shows an info toast ("Image upload queued. Please wait for uploads to complete before closing this tab."), then **closes the drawer immediately** — upload is fire-and-forget from this component's perspective; closing does not wait for the queue to flush.
- `.picture-icon { padding-right: 5px; }` is the only custom CSS.

#### Consumers (call sites)

- `src/app/console/events-table/events-table.component.html` (`[count]="rowItem['mediaCount']" [eventId]="rowItem['id']"`).
- `src/app/profile/spottings/spottings.component.html`.
- `src/app/spotting/vehicle-type-container/spotting-table/inline-history/inline-history.component.html`.

---

## SpottingImageListComponent

**Files:** `src/app/@ui/spotting-image-list/spotting-image-list.component.{ts,html,scss,spec.ts}` + `spotting-image-list.module.ts` (`NgModule`-declared, **not** standalone) + `services/get-medias.service.{ts,spec.ts}`. Selector `ui-spotting-image-list`.

### Purpose

The "view this event's photos, and optionally add more" panel `ImagePreviewButtonComponent`'s drawer hosts. Fetches the event's existing media itself (its own Apollo query), renders a simple fixed-size grid with a lightbox, and — only if the viewer owns the event (`isMine`) — shows a `FormUploadComponent` beneath for queuing new uploads.

### Inputs / Outputs

- `@Input() eventId!: string` — used verbatim as `filters: { id: eventId }` in `GetMediasService.fetch()` (ts:41-46).
- `@Input() isMine: boolean = false` — a template-only gate (`@if (isMine) { <h1>Add Images</h1><spotting-form-upload .../> }`); **not** re-validated against the fetched data's own `isMine` field (the query does return one — see below — but the component ignores it).
- No `@Output()`; instead exposes a public field `pendingUploads: ImageFile[]` that its host (`ImagePreviewButtonComponent`) reaches into via `getContentComponent()` — the drawer-content-instance pattern documented above, not a conventional Angular output.

### Rendering & styling — behavior to preserve

- **Fixed-size grid, not the aspect-ratio-aware `ImageGridComponent`**: every thumbnail is a hard `200px × 200px` `<img>` with `object-fit: cover` (scss:8-13) inside `<nz-image-group class="flex-container">` (`flex-flow: row wrap`) — this component deliberately **crops** non-square images to a uniform square rather than preserving aspect ratio like `image-grid` does. This is a real, intentional inconsistency between the two "view a set of images" components in this library — a conscious choice for the rewrite, not an accident to silently unify.
- `<nz-spin [nzSpinning]="loading" nzSize="large">` wraps the whole panel; `loading` starts `true` and only clears on (a) the **first** thumbnail's `load` event (`markLoaded()`, same "first-image-clears-everything" pattern as `ImageGridComponent`), or (b) immediately, in the query callback, **only if** the event has zero media at all (ts:57-59) — if media _do_ exist, `loading` stays `true` until an `<img>` actually fires `load`.
- Empty state: `<nz-empty nzNotFoundContent="No images. Add some?" />` when `imageUrls.length === 0 && !loading`.
- Broken-image fallback: identical inline `onerror` → `./assets/image-not-found.png` pattern.
- Click → lightbox: `NzImageService.preview()` over all of this event's images, `switchTo(index)` — independently reimplemented rather than delegating to `ImageGridComponent`.
- No custom colors/animation — all visuals are ng-zorro defaults.

### Data contract

```graphql
query ($filters: EventFilter) {
  events(filters: $filters) {
    isMine
    medias {
      file {
        url
      }
    }
  }
}
```

- Backend: `spotting/schema/schema.py:25-27` (`SpottingScalars.events`, `strawberry_django.field(filters=EventFilter, pagination=True, order=EventOrder)`) — **no `permission_classes`**, publicly callable.
- `EventFilter.id: strawberry.auto` (`spotting/schema/filters.py:20-21`) — an exact-match scalar filter (not a list `in` filter), matching the frontend's single scalar `id`.
- `EventScalar.is_mine` (`spotting/schema/scalars.py:72-79`): `self.reporter.id == info.context.user.id`, `False` if not logged in.
- `EventScalar.medias` (`scalars.py:66-70`): batched via `info.context.loaders["spotting"]["media_from_event_loader"]`.
- `MediaScalar.file.url` — the same legacy Imgur-hosted `ImgurField` used by the Gallery feature (see `docs/frontend-map/gallery.md`'s note that this field carries a backend `# TODO: Deprecate` comment).
- **Note**: a **second, distinct** `GetMediasService` class exists at `gallery/services/get-medias.service.ts` with a completely different query shape (`mediasGroupByPeriod`) — do not conflate the two when porting; see `gallery.md`'s Known Quirks for the cross-reference.

### Consumers (call sites)

Only `ImagePreviewButtonComponent`, which instantiates it programmatically via `NzDrawerService.create({ nzContent: SpottingImageListComponent, ... })` — no template anywhere writes `<ui-spotting-image-list>` directly.

---

## SpottingLineCalendarHeatmapComponent

**Files:** `src/app/@ui/spotting-line-calendar-heatmap/spotting-line-calendar-heatmap.component.{ts,html,scss,spec.ts}` — standalone, selector `spotting-line-calendar-heatmap`.

### Purpose

Renders a week-by-vehicle "which weeks was each vehicle on this line spotted" calendar-heatmap using AntV G2, for one line, over a caller-navigable date range (default: trailing 6 months). Distinct from `SpottingVehicleCalendarHeatmapComponent` below — this one is **line**-scoped (rows = every vehicle on the line, columns = ISO weeks) and fetches a **CSV** directly via G2's own data-fetch mechanism, not GraphQL/Apollo.

### Inputs / Outputs

- `@Input() lineId!: string`.
- `@Input() vehicleCount!: number` — used only to size the chart (`height = vehicleCount * ROW_HEIGHT`, `ROW_HEIGHT = 30`) — the caller must know/pass this; the component does not derive it from fetched data.
- No `@Output()`; instead it drives its own `startDate`/`endDate` **URL query params** via `Router.navigate([], { queryParamsHandling: "merge" })` (ts:114-123) on every range change, and reads them back via `ActivatedRoute.queryParams` on init (ts:151-169) — so the current range survives a refresh/deep-link.

### Rendering & styling — behavior to preserve

- **Data source is a REST CSV endpoint, not GraphQL**: `${environment.backendUrl}operation/line_vehicles_spotting_trend/${lineId}/${startDate}/${endDate}/` (ts:186), fed straight into G2's declarative `data: { value: url, type: "fetch", format: "csv" }` — G2 itself performs the fetch/parse, bypassing `HttpClient`/Apollo entirely. Backend: `operation/views.py:18-56`, `LineVehiclesSpottingTrend` (`APIView`, **no `permission_classes` — publicly reachable**) — computes weekly spotting counts per vehicle on the line via `common.utils.get_trends(date_group=WEEK, groupby_field="spotting_date", count_model=spotting.models.Event, filters=Q(vehicle__lines=line_id), add_zero=True, additional_groupby={"vehicle_id": [...]})`, serialized to CSV via `polars.DataFrame(...).write_csv()`, sorted by `vehicle, dateKey`.
- `add_zero=True` means weeks with **zero** spottings are still emitted as explicit zero-count rows (not omitted). This matters because the chart's color scale has an explicit **3-way** rule (`chartOptions.scale.color.relations`, ts:45-53): `null` → `"#eee"` (grey — no data returned at all), `0` → white, everything else → the `"BuPu"` sequential palette by count. A rewrite must preserve this 3-way distinction (missing vs. zero vs. count), not collapse it to a simple 2-way scale.
- X-axis tick labels are filtered to every 3rd ISO week (`tickFilter: (d) => Number.parseInt(d.split("-W")[1]) % 3 === 0`, ts:57-60) to avoid label crowding. Tooltip shows Week of Year / Vehicle / Count (ts:74-95).
- Date-range controls (html:1-17): `−3 Months` / `+3 Months` buttons (`moveMonths()`, ts:126-139, shifts both dates by whole months, resets `startDate` to day 1) plus a plain-text `"{{startDate}} - {{endDate}}"` label (`yyyy-MMM-dd`). `+3 Months` is **disabled** whenever `endDate` would land within 1 day of "now" (`allowNextMonth = endDate + 24h < now`, ts:111-112) — you cannot page the range into the near-future.
- Loading/error states: `<nz-spin nzSimple nzTip="Loading...">` while loading; `<nz-alert nzType="error" [nzMessage]="error.name" [nzDescription]="error.message">` if the G2 `.render()` promise rejects. Both ng-zorro defaults; the `.spinner{...}` SCSS block here is near-identical boilerplate repeated verbatim across several chart components in this library (see `VehicleStatusHistoryComponent`, `SpottingVehicleCalendarHeatmapComponent`).
- Renders inside `ngZone.runOutsideAngular(...)` (ts:182) to keep G2's own render loop out of Angular's change-detection cycle — a performance pattern worth preserving in spirit regardless of charting library.

### Consumers (call sites)

`situasi/vehicles/vehicles.component.html`, imported/declared via `situasi/line/line.module.ts`, `situasi/vehicles/vehicles.module.ts`, `situasi/situasi.module.ts` — all within the beta-tester-only `situasi` feature's per-line/per-vehicle detail views.

---

## SpottingTypeCellDisplayComponent

**Files:** `src/app/@ui/spotting-type-cell-display/spotting-type-cell-display.component.{ts,html,scss,spec.ts}` — standalone, selector `spotting-type-cell-display`.

### Purpose

The "where was this spotted" table-cell renderer used by every event-listing table (console, profile, inline vehicle history). Shows the spotting-type tag plus, depending on what data the event actually has, either a clickable Google Maps link (precise GPS captured) with a hover-tooltip of full location detail, or a plain origin/destination station description (station-based logging).

### Inputs / Outputs

- `@Input() rowItem!: ConsoleEventsGqlResponseTableDataElement` — the **entire event row object** (`id, type, status, location{accuracy, altitude, altitudeAccuracy, heading, speed, latitude, longitude}, originStation, destinationStation, ...`, shape defined at `console/services/events-gql.service.ts:9-68`). This component reaches into many of that shape's fields directly, coupling it to a Console-service-defined interface even though it's also reused by Profile and inline-history (both must supply an object satisfying that same shape).
- `@Input() spottingType!: SpottingType` — passed separately even though `rowItem.type` already holds the same value; every consumer binds both `[rowItem]="rowItem"` and `[spottingType]="rowItem[...].type"` redundantly (confirmed identical pattern at all three call sites) — likely leftover duplication; a rewrite could collapse this to one input.

### Rendering & styling — behavior to preserve

- Always renders a `<spotting-type-tag [spottingType]="spottingType">` first.
- Then, in priority order (html:4-32): (1) if `rowItem.location` is present → a Google Maps deep-link (`https://www.google.com/maps?q={lat},{lng}`, new tab) whose text is `rowItem.location | coordinatesHumanizer:3` (`N/S`+`E/W`-suffixed lat/lon plus a "± Xm" accuracy figure, `coordinates-humanizer.pipe.ts:8-28`); (2) else if `rowItem.originStation` is present → for `type === "AT_STATION"`, just the station's `displayName`; for `type === "BETWEEN_STATIONS"` (and only if `destinationStation` is also present), `"{origin} -> {destination}"`; (3) otherwise, nothing beyond the tag.
- **Conditional info-icon + tooltip**: `showLocationPopover` is set `true` in `ngOnInit` (ts:44-53) only if `location.altitude || location.heading || location.speed` is truthy. When true, an `nz-icon[nzType="info-circle"]` appears next to the coordinates link; hovering (`nz-tooltip`, placement `right`) shows a small table (html:37-93) of Location/Accuracy/Altitude(±accuracy)/Heading/Speed. **Speed is converted from m/s to km/h by multiplying by 3.6 inline in the template** (html:85) — a real unit-conversion rule to preserve exactly, not just a formatting detail. All numeric values go through `BeautifulDecimalPipe` (`toPrecision(5)` then strip trailing zeros/decimal point, `beautiful-decimal.pipe.ts:8-10`) — e.g. `12.340000` → `12.34`, `12.00000` → `12`.
- Only custom CSS: `.location-popover { width: 300px; padding: 20px; }`.

### Consumers (call sites)

`console/events-table/events-table.component.html`, `profile/spottings/spottings.component.html`, `spotting/vehicle-type-container/spotting-table/inline-history/inline-history.component.html` — all three pass `[rowItem]` and a redundant `[spottingType]`.

---

## SpottingTypeTagComponent

**Files:** `src/app/@ui/spotting-type-tag/spotting-type-tag.component.{ts,html,scss,spec.ts}` + `spotting-type-tag.module.ts` (`NgModule`-declared, **not** standalone). Selector `spotting-type-tag`.

### Purpose

Color-coded badge for a spotting event's `SpottingType` (where/how it was spotted). Purely presentational, same pattern as the other three tag components documented in this file.

### Inputs / Outputs

`@Input() spottingType!: SpottingType` (required; `SpottingType = "DEPOT" | "LOCATION" | "BETWEEN_STATIONS" | "JUST_SPOTTING" | "AT_STATION"`, matching backend `spotting.enums.SpottingEventType` exactly, value-for-value — confirmed at `spotting/enums.py:4-9`). No output. Label text comes from `SpottingTypePipe` (`pipes/spotting-type/spotting-type.pipe.ts:16-24`: DEPOT→"Depot", LOCATION→"Location", BETWEEN_STATIONS→"Between Stations", JUST_SPOTTING→"Just Spotting", AT_STATION→"At Station").

### Rendering & styling — behavior to preserve

| SpottingType     | `nzColor`                      |
| ---------------- | ------------------------------ |
| JUST_SPOTTING    | `green`                        |
| BETWEEN_STATIONS | `green`                        |
| DEPOT            | `yellow`                       |
| LOCATION         | `red`                          |
| **AT_STATION**   | _(none — falls to `@default`)_ |

**Coverage gap**: `AT_STATION` is a real, valid backend enum value but has no explicit case in the `@switch` (html:1-19) — it silently falls to `@default`, rendering `nzColor="var(--devui-text-weak)"` (grey/muted, theme-aware) instead of a dedicated color. Confirm with the maintainer whether this is intentional before the Tailwind rewrite locks in a color palette (see Open Questions). Uses the same ng-zorro preset-tag rendering mechanics (light bg + colored border + colored text, non-dark-aware) documented once in this doc's top-level Purpose section. `spotting-type-tag.component.scss` is empty.

### Consumers (call sites)

Only used **indirectly**, embedded inside two other `@ui` components: `ActionListComponent` (`action-list.component.html:25`) and `SpottingTypeCellDisplayComponent` (`spotting-type-cell-display.component.html:2`). No feature-area template writes `<spotting-type-tag>` directly.

---

## SpottingVehicleCalendarHeatmapComponent

**Files:** `src/app/@ui/spotting-vehicle-calendar-heatmap/spotting-vehicle-calendar-heatmap.component.{ts,html,scss,spec.ts}` + `spotting-vehicle-calendar-heatmap.module.ts` (`NgModule`-declared, **not** standalone) + `services/get-data/get-data.service.ts` (REST, actually used) + `services/get-data-gql/get-data-gql.service.ts` (GraphQL, **dead code** — see below). Selector `spotting-vehicle-calendar-heatmap`.

### Purpose

A single-vehicle "which days over the last ~10 months was this vehicle spotted" GitHub-contribution-style calendar, built with AntV G2Plot's `Heatmap`. Distinct from the line-scoped `SpottingLineCalendarHeatmapComponent`: this one is per-vehicle, day-granularity, and draws visible month-boundary borders on the cells themselves.

### Inputs / Outputs

`@Input() vehicleId!: string` only; no output. Re-fetches and fully rebuilds the chart on every subsequent change to `vehicleId` (`ngOnChanges`, ts:297-305 — destroys the old `Heatmap` and calls `setAndRenderChart()` again).

### Rendering & styling — behavior to preserve

- **Data source is REST, not GraphQL**: `GetDataService.getData()` calls `GET {backendUrl}operation/vehicle_spotting_trend/{vehicleId}/{startDate}/{endDate}/` (hardcoded range: today minus 10 months, day-1, through today — ts:262-270). Backend: `operation/views.py:102-155`, `VehicleSpottingTrend` (`APIView`, **no permission/auth check**) — `get_trends(date_group=DAY, groupby_field="spotting_date", filters=Q(vehicle_id=vehicle_id), add_zero=True, free_range=False)`, then computes a **year-week → sequential column-index mapping** server-side (`date_week_index_dict`) so the frontend needs no ISO-week arithmetic of its own. Response shape: `{ data: [...], mappings: { yearWeek: {"2025W32": 0, ...} } }`.
- **A second, entirely unused GraphQL service lives in this same folder**: `services/get-data-gql/get-data-gql.service.ts` defines `GetDataGqlService` (`vehicles(filters: VehicleFilter) { id identificationNo nickname }`) plus a response-shape interface the component only imports for type annotations on two fields — `gqlSubscription: Subscription` and `watchQueryOption: QueryRef<...>` (ts:53-54) — that are **declared but never assigned or read anywhere** (confirmed by grep: no other reference to either field in the file). `GetDataGqlService` itself is never injected/instantiated outside its own trivial spec test. **Treat this whole service plus the two dead fields as dead code to drop**, not behavior to reproduce.
- **Custom polygon shape** (`registerPolygons()`, ts:158-242): registers a G2 shape `"boundary-polygon"` drawing each day-cell as a filled quadrilateral (`fill: cfg.color`, 1px white stroke); for cells flagged `isLastWeekOfMonth` (from the backend's `is_last_week_of_month`), it additionally draws a thick (4px, `#404040`) right-hand border, and — if also `isLastDayOfMonth` — a matching thick top border. This produces month-boundary gridlines baked directly into cell geometry rather than a separate overlay. **This exact double-thick-border-on-month-boundary visual must be preserved** however the rewrite implements the heatmap.
- **X-axis label logic** (ts:91-155) is intentionally intricate: labels only draw on `dayOfWeek === 6` (Saturday) columns, showing `"{year}\n{month}"` only when that Saturday's day-of-month is ≤7 (so only the _first_ Saturday of each month gets a label, avoiding repeats across ~4 weekly columns) — plus a fallback branch (ts:112-150) specifically for the chart's last column, handling the edge case where that column has no Saturday entry at all (finds the latest weekday's data in that column instead). Worth re-deriving carefully or literally porting rather than approximating.
- **Live theme sync**: subscribes to the app-wide `ThemeService.colorScheme` (`"light"|"dark"`, constructor ts:250-258) and, on every theme change, updates the **already-rendered** `Heatmap`'s G2Plot `theme` option and re-renders in place — unlike the flat, non-theme-aware `nz-tag` colors used elsewhere in this library, **this specific chart's color scheme actively flips with the app's light/dark toggle, live**, without a full remount. A rewrite must preserve this live-retheming, not just a build-time light/dark split.
- Standard G2Plot config otherwise: `yAxis.grid: null`, `xAxis.label.offset: 12`, legend enabled, `element-active` hover interaction. Loading state uses the same `<nz-spin nzSimple>` + generic `.spinner{...}` pattern as the other chart components here.

### Consumers (call sites)

`situasi/vehicle-details/vehicle-details.component.html`, imported via `situasi/vehicle-details/vehicle-details.module.ts` — the per-vehicle detail page in the beta-tester-only `situasi` feature.

---

## VehicleStatusHistoryComponent

**Files:** `src/app/@ui/vehicle-status-history/vehicle-status-history.component.{ts,html,scss,spec.ts}` + `vehicle-status-history.module.ts` (`NgModule`-declared, **not** standalone) + `services/get-data.service.ts`. Selector `ui-vehicle-status-history`.

### Purpose

A per-line, stacked time-series area chart of **vehicle status counts over time** (how many vehicles on this line were IN_SERVICE / OUT_OF_SERVICE / etc. on each snapshot date), with a **switchable data source** — the platform's own community-sourced data ("MLPTF") vs. a second, third-party-scraped source ("MTREC"), plus a disabled placeholder for a future official "Prasarana" source. Includes a synchronized, click-to-filter custom tooltip/legend row of `nz-statistic` tiles above the chart.

### Inputs / Outputs

- `@Input() lineId!: string`.
- `@Input() sources!: LineVehiclesChartographySource[]` — available `chartography.Source` records for this line (`situasi/vehicles/get-gql-data/get-gql-data.service.ts:5-10`: `{id, name, description, officialSite}`); used only to decide whether the "MTREC" data-source option should be enabled (`ngOnChanges`, ts:65-82 — checks for a `name === "MTREC"` entry). No `@Output()`.

### Rendering & styling — behavior to preserve

- **Data source is REST, not GraphQL**: `GetDataService.getData(lineId, source, startDate, endDate)` → `GET {backendUrl}operation/line_vehicles_status_trend_count/{lineId}/{source}/{startDate}/{endDate}/`. Backend `LineVehiclesStatusTrendCount` (`operation/views.py:59-99`, **no permission/auth check**) resolves `source_str` to a `chartography.models.Source` row (case-insensitive name match, 404 if unknown), then queries `chartography.models.LineVehicleStatusCountHistory` joined through `Snapshot` (filtered to that source + date range) where the line either matches directly **or** is one of a "custom line"'s `mapped_lines` — a backend modeling detail explaining why status-count history can surface for a line grouping the frontend didn't explicitly request. Default range: hardcoded trailing 10 months from "now."
- Chart: AntV G2Plot `Area`, `xField: date`, `yField: count`, `seriesField: status` — each status becomes its own stacked/overlaid series colored via **G2's own default 10-color categorical theme** (`chartRef.chart.getTheme()["colors10"]`, ts:204-205) — **not** the same colors `VehicleStatusTagComponent` uses for the same status strings elsewhere in the app. This is a real cross-component color-consistency gap worth resolving one way or the other in the rewrite (see Open Questions). X-axis labels are reformatted via `v.split("/").reverse().join("-")` (ts:135-137) — see Open Questions re: whether the backend's actual date format makes this a no-op.
- **Custom synchronized tooltip** (`setInitialHighlight`, ts:84-109; `chart.on("tooltip:change", ...)`): on load, auto-highlights the most recent data point and populates a custom `nz-statistic` row (html:35-58), one tile per status active on that date, each showing `nzValue=count` / `nzTitle=status` (title-cased, underscores→spaces) with a colored marker square from the same `sequenceColors` array. Hovering the chart live-updates `activeTooltipTitle`/`tooltipItems` via G2's `tooltip:change` event. **`tooltip.showContent: false`** in the chart config confirms G2's native floating tooltip bubble is deliberately suppressed in favor of this custom row — this is a real UI substitution to preserve, not a display nicety layered on top of the default tooltip.
- **Click-to-toggle series** (`changeActiveSeries`, ts:210-241): clicking an `nz-statistic` tile toggles that status in/out of `activeSeriesList`, which both dims the tile (`.inactive { opacity: 0.25 }`) and applies a live G2 `chart.filter("status", ...)` hiding/showing that series' area on the chart, re-marking the active hover-point for any remaining active series at the current tooltip title. This is a real interactive legend (click-to-filter), not just click-to-highlight.
- Data-source switch (`nz-segmented`, `onDataSourceChange`, html:29-32/ts:243-270): re-fetches via REST with the new `source` segment, `chartRef.update({data})` **in place** (no destroy/recreate); updates `infoTip` — an `nz-tooltip` disclaimer specifically for MTREC ("Data is scraped on a best effort basis from Malaysia Trains & Rail Enthusiasts (MTREC) and hence may not reflect entirely their data.") and an already-drafted-but-unused one for "Prasarana" ("Official data from Prasarana website collected on a best effort basis."). A small `nz-icon[nzType="loading"]` appears inline next to "Source" while the new data loads.
- **Likely-dead positioning CSS**: `#vehicle-status-history-container { top/bottom/left/right; padding-top: 20px }` (scss:59-65) only has visible effect if some ancestor sets `position: relative`/`absolute` — none is set in this component's own files. The `.g2-tooltip*` class names throughout this stylesheet are copied verbatim from AntV's own official G2Plot custom-tooltip example, not renamed to this project's conventions — flag as tech debt/dead CSS to verify on the live site, not necessarily behavior to reproduce literally.

### Consumers (call sites)

`situasi/vehicles/vehicles.component.html`, imported via `situasi/vehicles/vehicles.module.ts` only.

---

## VehicleStatusTagComponent

**Files:** `src/app/@ui/vehicle-status-tag/vehicle-status-tag.component.{ts,html,scss,spec.ts}` — standalone, selector `vehicle-status-tag`.

### Purpose

Color-coded badge for a single vehicle's operational status — the most widely reused status tag in this library (see Consumers).

### Inputs / Outputs

`@Input() vehicleStatus!: VehicleStatus | SpottingVehicleStatus` — a deliberate union of **two different types**: `operation.enums.VehicleStatus` (7 backend values: IN_SERVICE, NOT_SPOTTED, OUT_OF_SERVICE, DECOMMISSIONED, MARRIED, TESTING, UNKNOWN — confirmed `operation/enums.py:14-21`, used by most GraphQL-fetched vehicle data) and a narrower **frontend-only** type, `spotting-form.types.ts`'s local `VehicleStatus` (IN_SERVICE, NOT_IN_SERVICE, DECOMMISSIONED, TESTING — used only by the vehicle-picker dropdown inside the spotting-submission form; `NOT_IN_SERVICE` does not exist in the backend `operation.VehicleStatus` enum at all, though it does exist in a _third_, separate backend enum, `spotting.enums.SpottingVehicleStatus`, used elsewhere for the submission form's own status field). No output. Labels come from `VehicleStatusPipe` (`pipes/vehicle-status/vehicle-status.pipe.ts:23-35`), whose dict covers all 8 distinct strings across both source types, falling back to the literal `"Unknown"` for anything else.

### Rendering & styling — behavior to preserve

| Status             | `nzColor`             |
| ------------------ | --------------------- |
| IN_SERVICE         | `green`               |
| NOT_SPOTTED        | `yellow`              |
| TESTING            | `blue`                |
| UNKNOWN            | `red`                 |
| OUT_OF_SERVICE     | `red`                 |
| **DECOMMISSIONED** | _(none — `@default`)_ |
| **MARRIED**        | _(none — `@default`)_ |
| **NOT_IN_SERVICE** | _(none — `@default`)_ |

**Coverage gap**: 3 of 8 possible values fall through to the grey `@default` (`var(--devui-text-weak)`) despite `VehicleStatusPipe` having well-formed dedicated text for all of them ("Decommissioned", "Married", "Not in Service") — the largest color-coverage gap of the four tag components in this library. Confirm with the maintainer whether e.g. DECOMMISSIONED/MARRIED deserve distinct colors (arguably as significant as OUT_OF_SERVICE) before the rewrite locks in new color tokens — see Open Questions. Same ng-zorro preset-tag rendering + non-dark-aware caveat documented in this doc's top-level Purpose section. `vehicle-status-tag.component.scss` is empty.

### Consumers (call sites)

The widest-used tag in the library: `ActionListComponent`, `VehicleTableCellDisplayComponent` (both `@ui`, below), plus directly from feature templates — `spotting/spotting-form/spotting-form.component.html`, `spotting/vehicle-type-container/spotting-table/spotting-table.component.html`, `spotting/vehicle-type-container/spotting-table/inline-history/inline-history.component.html`, `profile/spottings/spottings.component.html`, `console/events-table/events-table.component.html`.

---

## VehicleTableCellDisplayComponent

**Files:** `src/app/@ui/vehicle-table-cell-display/vehicle-table-cell-display.component.{ts,html,scss,spec.ts}` — standalone, selector `vehicle-table-cell-display`.

### Purpose

A compound table-cell renderer showing a vehicle's identification number + type, an optional 📝 notes tooltip, and its status tag, as one reusable unit for any table listing rows keyed by vehicle (console's and profile's event tables both use this for their "Vehicle" column).

### Inputs / Outputs

`@Input() vehicleData!: VehicleData` — a locally-declared shape (ts:14-27): `{id, status, identificationNo, notes, vehicleType: {internalName}, lines: [{code}]}` (note: `lines` is _typed_ as a 1-tuple `[{code: string}]` but `ngOnInit` treats it as an arbitrary-length array via `.map().join(", ")` — a type-inaccuracy in the source, not a real one-line-only constraint). No output.

### Rendering & styling — behavior to preserve

- Main link text is `"{identificationNo} ({vehicleType.internalName})"`, wrapped in an `<a>` to the Django-admin vehicle edit page (`{backendUrl}admin/operation/vehicle/{id}`) — same same-tab, no-`target` pattern as `ActionListComponent`'s admin link (requires a separate Django-admin login; see Open Questions).
- `nz-tooltip[nzTooltipTitle]` on that same `<a>` shows the **comma-joined list of all line codes** the vehicle belongs to (computed once in `ngOnInit`, ts:46-52) — hovering the identification number reveals which line(s) it runs on, not otherwise visible in the cell.
- If `vehicleData.notes` is non-empty, an inline 📝 emoji (a literal Unicode character in the template, not an `nz-icon`) appears with its own `nz-tooltip[nzTooltipTitle]="vehicleData.notes"` (placement `right`) — the only way this component surfaces free-text vehicle notes.
- Renders `<vehicle-status-tag [vehicleStatus]="vehicleData.status">` last.
- `vehicle-table-cell-display.component.scss` is empty — no custom CSS at all.

### Consumers (call sites)

`console/events-table/events-table.component.html`, `profile/spottings/spottings.component.html` — both bind `[vehicleData]="rowItem[colOption.field]"`.

---

## VerificationCodeCardComponent

**Files:** `src/app/@ui/verification-code-card/verification-code-card.component.{ts,html,scss,spec.ts}` + `verification-code-card.module.ts` (`NgModule`-declared, **not** standalone) + `services/get-code.service.ts`. Selector `verification-code-card`.

### Purpose

A self-contained "link your account to the platform's Telegram bot" card — lets a logged-in user request a fresh 6-digit numeric verification code (to paste into the bot chat) and shows a live countdown until the code visually disappears from the UI. This is the frontend half of the Telegram-linking flow; the bot-side code-redemption logic lives outside this repo.

### Inputs / Outputs

**None** — no `@Input()`, no `@Output()`. The component is entirely self-driven: it reads `AuthService.userData` itself to decide whether to render at all, and owns all request/countdown state internally.

### Rendering & styling — behavior to preserve

- Renders **nothing** (not even an empty card) when there's no logged-in user (`@if (authService.userData | async)`, html:1) — unlike most components in this library, which always render something, this one is self-hiding.
- `<nz-card nzTitle="Bot Linking">` with an `nzExtra` info-icon link to the project wiki (`.../wiki/Linking-to-Telegram`, new tab) — the only in-app pointer to _how_ to actually use the code once obtained (no inline instructions text).
- Two mutually-exclusive states: (a) `verificationCode === undefined` → a single "Request Code" primary button (`[nzLoading]="isLoading"` while the mutation is in flight); (b) once a code exists → an `nz-statistic` showing the raw numeric code as `nzValue` and a dynamic title `"Verification code expiring in {countdown} seconds."`.
- **Countdown mechanics** (ts:33-71): `getCode()` fires the `requestVerificationCode` mutation, explicitly attaching the Firebase ID token as a `firebase-auth-key` header via Apollo's per-call `context` (ts:41-44) — this is **necessary, not redundant**: `src/app/graphql.module.ts` configures a completely bare Apollo client (plain `HttpLink` + `InMemoryCache`, no auth link/interceptor of any kind), and a repo-wide grep found **zero** `HttpInterceptor`/`HTTP_INTERCEPTORS` registrations anywhere in the app — so there is no global auth-header wiring for GraphQL at all; every authenticated mutation must attach its own Firebase token per-call exactly like this one does. Then starts a `setInterval` ticking `countdown` down from `VERIFICATION_COUNTDOWN = 60` once per second, manually calling `ChangeDetectorRef.detectChanges()` on every tick (required since a raw `setInterval` doesn't trigger Angular change detection on its own). At `countdown === 0`: clears the interval and resets `verificationCode`/`codeExpiry` to `undefined`/`60`, flipping the template back to state (a) — **the code visually disappears after exactly 60 seconds**, unconditionally, every time.
- **The 60-second disappearance is a purely client-side/visual convention**: the backend `UserVerificationCode` model (`common/models.py:129-135`) has **no expiry field at all** — the 6-digit code (`get_verification_code`, range 100000–999999, `unique=True`) does not expire server-side after 60 seconds as far as this repo shows. Whether the Telegram bot enforces its own TTL on redemption is outside this repo and unconfirmed — see Open Questions; do not assume the UI countdown reflects a real server-side deadline.
- No custom SCSS at all — entirely `nz-card`/`nz-statistic`/`nz-button`/`nz-icon` defaults.

### Data contract

`mutation { requestVerificationCode { code } }` → `common/schema/schema.py:93-100`, **`permission_classes=[IsLoggedIn]`** (`rosak/permissions.py:35-39`: `bool(info.context.user)`) — this mutation _does_ enforce login server-side, consistent with (and stricter than) the frontend's own template-level hiding of the whole card for logged-out users. Every successful call unconditionally **creates a new** `UserVerificationCode` row (no upsert/reuse of a still-valid code, no visible rate-limiting in the resolver) tied to `info.context.user`.

### Consumers (call sites)

`header/login-dropdown/login-dropdown.component.html:24` (inside an `nz-space`, `*nzSpaceItem`) — part of the header's account dropdown, imported via `header/header.module.ts`.

---

## WheelStatusTagComponent

**Files:** `src/app/@ui/wheel-status-tag/wheel-status-tag.component.{ts,html,scss,spec.ts}` — standalone, selector `wheel-status-tag`.

### Purpose

Color-coded badge for a spotted vehicle's wheel/bogie condition — an optional secondary observation logged alongside a spotting event, separate from the vehicle's overall service status. Same presentational pattern as the other three tag components — and notably the **only** one of the four whose backend enum is fully covered by explicit colors.

### Inputs / Outputs

`@Input() wheelStatus!: string` (typed as a bare `string`, looser than the other three tag components' inputs) matching backend `spotting.enums.SpottingWheelStatus` (5 values: FRESH, NEAR_PERFECT, FLAT, WORN_OUT, WORRYING — confirmed `spotting/enums.py:23-28`). No output. The whole template is wrapped in `@if (wheelStatus)` (html:1) — unlike the other three tag components, this one renders **nothing at all** (not even a default grey tag) when `wheelStatus` is falsy/`null`, consistent with the backend field being genuinely nullable (`Event.wheel_status`, `blank=True, null=True, default=None`, `spotting/models.py:60-65`) since not every spotting includes a wheel-condition observation.

### Rendering & styling — behavior to preserve

| WheelStatus  | `nzColor` |
| ------------ | --------- |
| FRESH        | `green`   |
| NEAR_PERFECT | `green`   |
| FLAT         | `yellow`  |
| WORN_OUT     | `red`     |
| WORRYING     | `red`     |

**Full coverage**: all 5 backend enum values have an explicit color — `@default` exists in the template but, given the `string`-typed input and the `@if (wheelStatus)` guard, is realistically unreachable for any value the backend can actually produce.
Label text is computed **inline in the template**, not via a dedicated pipe like the other three tag components: `{{ wheelStatus.replace("_", " ") | titlecase }}` (e.g. `WORN_OUT` → "Worn Out"). This uses `String.replace` with a **string** argument (not a regex with the `g` flag), so only the **first** underscore is replaced — irrelevant for all 5 current values (none contain more than one underscore) but would silently mis-render a hypothetical future value like `SOME_OTHER_THING` as `"Some other_thing"`. Worth switching to a global replace in the rewrite regardless of whether it's ever hit in practice. Same ng-zorro preset-tag rendering + non-dark-aware caveat documented in this doc's top-level Purpose section. `wheel-status-tag.component.scss` is empty.

### Consumers (call sites)

Only `spotting/vehicle-type-container/spotting-table/spotting-table.component.html` (inside a `@case ("wheelStatus")` column-type switch).

---

## Open Questions / Verify Against Live Site

- **Ant Design preset-tag colors** used by `LineStatusTagComponent`/`SpottingTypeTagComponent`/`VehicleStatusTagComponent`/`WheelStatusTagComponent` (the table in this doc's Purpose section) were read directly out of the compiled `src/nz-zorro.scss` selectors, not visually confirmed on a running page — take a screenshot pass across all four components' rendered tags on the live site before finalizing Tailwind color tokens.
- **`ActionListComponent` entry ordering** — my reading of Angular's default `keyvalue` pipe comparator says entries render oldest-first (ascending by millisecond-epoch key string), which may read as backwards for an "activity feed." Confirm the actual on-screen order on the live site (inside the spotting-form drawer, after submitting 2+ spottings in one session) before deciding whether to preserve or fix in the rewrite.
- **`ActionListComponent`'s `.flex-container { width: 100vw }`** — confirm whether this currently visibly overflows/clips inside the spotting-form drawer on the live site, or whether an ancestor's `overflow: hidden` already masks it.
- **`VehicleStatusHistoryComponent`'s `#vehicle-status-history-container` positioning rules** (`top/bottom/left/right`, no `position` set in this component's own files) — confirm whether some ancestor component sets `position: relative`/`absolute` making these rules meaningful, or whether they're inert dead CSS safe to drop.
- **`VehicleStatusHistoryComponent`'s `v.split("/").reverse().join("-")` x-axis date-label transform** — only does anything if the backend's actual JSON date serialization for `LineVehicleStatusCountHistory.snapshot.date` uses `/`-separated dates; Django/DRF defaults suggest ISO `YYYY-MM-DD` (no `/`), which would make this line a no-op. Verify the real network response on the live site.
- **Backend-side actual validity/expiry of a requested verification code** beyond `VerificationCodeCardComponent`'s cosmetic 60-second UI countdown — the Django model has no expiry field; whether the Telegram bot enforces any TTL itself is outside this repo (`telegram_provider` app / the bot process) and was not checked.
- **`ImageDrawerComponent` (Insiden) renders `<spotting-form-upload>` unconditionally**, with no `isMine`/ownership gate, unlike `SpottingImageListComponent`'s gated version for the equivalent spotting-side flow — confirm with whoever owns the Insiden feature doc whether that asymmetry is intentional before the rewrite either preserves or "fixes" it.
- **Color-coverage gaps** in `SpottingTypeTagComponent` (missing `AT_STATION`) and `VehicleStatusTagComponent` (missing `DECOMMISSIONED`, `MARRIED`, `NOT_IN_SERVICE`) were derived from a static enum-vs-`@switch` comparison against the backend schema; whether these are deliberate "unremarkable → default grey" choices or oversights should be confirmed with whoever set the original color conventions before the Tailwind rewrite locks in a final palette.
- **`VehicleStatusHistoryComponent` chart series colors** (G2's default categorical palette) visibly differing from `VehicleStatusTagComponent`'s dedicated per-status tag colors used for the same status strings everywhere else in the app — not verified how jarring this looks in practice; worth a side-by-side screenshot before deciding whether to unify them in the rewrite.
- **`FormUploadComponent`'s `.devui-add-images { margin-bottom: 50px }`** — flagged as a possible leftover/oversized gap from the removed ng-devui styling; eyeball the live upload UI (spotting-form, or the image-preview-button drawer) before deciding whether to preserve that exact spacing.
- **Same-tab (no `target="_blank"`) Django-admin links** in both `ActionListComponent` and `VehicleTableCellDisplayComponent` — these require a separate Django-admin login from the app's Firebase session; whether navigating away from the SPA in the same tab is an intentional "admin power-user" affordance or an oversight (should open in a new tab instead) could not be determined from source alone.
