# Known Defects & Traps — rosak_firebase

> Compiled from `docs/COMPONENTS.md` and `docs/components/*.md` (Phase 1 per-feature audits).
> Each entry follows: **Date**, **Component**, **Problem**, **Root Cause**, **Fix**, **Prevention**.
> Fixed items marked with fix date and commit reference.

---

## console

### [2026-08-24] console: adminOnlyGuard Always Returns True (Unprotected Admin Route)

**Problem**: The `/console` admin moderation route was accessible to any visitor (authenticated or not) who knew the URL. The route guard `adminOnlyGuard` unconditionally returned `true` with a `TEMPORARY` comment.

**Root Cause**: The Firebase `admin` custom claim was not reliably granted server-side, so the real `auth.isAdmin()` check was commented out as a stopgap. The guard boundary existed at the routing layer but the enforcement logic was disabled.

**Fix**: Enforced the admin claim check in `admin-only.guard.ts` (uncommented `auth.isAdmin()`). **Commit: 29b5d6d** (2026-08-24).

**Prevention**:

- Never leave security guards in a "temporary pass-through" state without a tracking issue and deadline.
- Add a CI check that fails if any route guard contains `return true` with a `TEMPORARY` comment.
- Document the server-side dependency (custom claim provisioning) in the guard's JSDoc.

---

### [2026-08-13] console: No Shareable/Saved Filter Views (Missing Query-Param Binding)

**Problem**: Admins cannot bookmark or share a specific filtered moderation queue view (e.g., "unread depot spottings with notes"). Filter state lives only in local signals.

**Root Cause**: `ConsolePage` does not inject `ActivatedRoute` or read/write query params. The app has **zero** existing query-param-binding pattern anywhere — only path params are wired via Angular's component-input-route-binding.

**Fix**: Not yet implemented. Requires a reusable "sync a signal ↔ a query param" utility (cross-component opportunity #1 in COMPONENTS.md).

**Prevention**:

- Build the shared URL-state sync utility first, then apply to all 7 features that need it (gallery, gdpr, about, spotting, console, insiden, tracker).
- Add query-param sync as a required acceptance criterion for any new filterable list view.

---

### [2026-08-13] console: No Client-Side Export Utility for Moderation Queue

**Problem**: Admins cannot export the current filtered queue as CSV/JSON. The data is already resident client-side in `events: Signal<ConsoleEvent[]>`.

**Root Cause**: No shared `core/export` utility exists. Four features (profile, console, insiden, gallery) independently need this.

**Fix**: Not yet implemented. Cross-component opportunity #2 in COMPONENTS.md.

**Prevention**:

- Build a shared `core/export` module (CSV/JSON serializer + `.ics` generator) once, reuse across all features.
- Add export as a standard capability for any data-table component.

---

## gdpr

### [2026-08-24] gdpr: Firestore Read Failure Renders Identically to Empty Document (Silent Failure)

**Problem**: A genuine Firestore read failure (network error, permission denied, document not found) rendered identically to an empty document — no error UI, no retry option, no user-visible distinction.

**Root Cause**: The `onSnapshot` error callback only cleared `isLoading` (`() => this.isLoading.set(false)`), leaving `_data` as `undefined`. The template's `isLoading` / `details().length === 0` branches collapsed both "still loading" and "failed to load" into the same empty state.

**Fix**: Added `isError` signal set from the error callback, plus `@if (isError())` branch with a Retry button that re-subscribes to the Firestore document. **Commit: ba95758** (2026-08-24).

**Prevention**:

- Every async data subscription MUST have an explicit error signal and error UI branch.
- Add a lint rule or code review checklist item: "Does every `onSubscribe`/`onSnapshot`/`httpResource` have error handling with user-visible feedback?"
- Use the shared `RetryBannerComponent` pattern (already used by insiden) for consistency.

---

### [2026-08-13] gdpr: No Deep-Link to Individual Compliance Items

**Problem**: Users cannot share a direct link to a specific GDPR checklist item (e.g., `/gdpr#data-retention`).

**Root Cause**: `group.title` / `child.title` are used as `@for` `track` keys but not rendered as element `id`s. No URL fragment handling exists.

**Fix**: Not yet implemented. Listed as "Ready now" in feature opportunities.

**Prevention**:

- When rendering lists with stable identifiers, always add `id` attributes derived from those identifiers.
- Implement fragment-based deep-linking as a shared pattern (applies to gdpr, about, insiden).

---

## about

### [2026-08-24] about: Firestore Read Failure Renders Identically to Empty Document (Silent Failure)

**Problem**: Same as gdpr — a failed Firestore subscription renders identically to an empty document with no user-visible distinction or retry.

**Root Cause**: Identical to gdpr — the `onSnapshot` error callback only does `() => this.isLoading.set(false)`. No `hasError` signal or error UI exists.

**Fix**: Added `hasError` signal set inside the error callback plus `@if` branch in `about.page.html` with a retry action that re-invokes the subscription. **Commit: ba95758** (2026-08-24).

**Prevention**:

- Same as gdpr — enforce error signal + error UI for every Firestore subscription.
- Since gdpr and about share the exact same pattern (`_data` signal + `computed()` projections + manual subscribe/unsubscribe), fix both simultaneously when the pattern is discovered.

---

### [2026-08-13] about: No Deep-Linkable Sections

**Problem**: The three content sections (projects, personnel, tech stack) have no addressable anchors (e.g., `/about#personnel`).

**Root Cause**: `AboutPage` takes no route params and never injects `ActivatedRoute`. No stable `id` attributes on sections.

**Fix**: Not yet implemented. Requires `ActivatedRoute`/`fragment` injection and stable `id` attributes.

**Prevention**:

- Design page sections with stable `id`s from the start.
- Implement fragment-based navigation as a shared utility.

---

## spotting

### [2026-08-13] spotting: line-details Filters Not URL-Synced

**Problem**: `VehicleSpottingGridComponent`'s `statusFilter`/`months` (owned by `line-details.page.ts`) are plain local signals with zero query-param sync. Users cannot share a filtered grid view.

**Root Cause**: The URL-sync pattern exists in `line-overview` (sort column/direction → `sort`/`dir` query params) but was not applied to `line-details`. The `months` window is a computed date range, not a flat enum, requiring custom encoding (e.g., ISO month key).

**Fix**: Not yet implemented. Listed as "modest to add now that there's a working example in the same feature."

**Prevention**:

- Apply the existing URL-sync pattern (`toSignal(route.queryParamMap)` + browser-only `router.navigate` with `replaceUrl: true`) to all filterable views.
- Create a reusable `syncSignalWithQueryParam` composable for the common case.

---

### [2026-08-13] spotting: Report Form Drafts Not Persisted (Closing Sheet Loses In-Progress Report)

**Problem**: An `effect()` calls `clear()` (resets model, photos, form) the moment `ReportSheetService.isOpen()` flips to closed. No localStorage/IndexedDB persistence exists — closing the sheet by accident loses the whole in-progress report.

**Root Cause**: No persistence layer for form drafts. The only existing persistence in the app is the upload queue's IndexedDB, which is upload-specific.

**Fix**: Not yet implemented. Listed as "purely additive" — persist draft to `sessionStorage` alongside the model signal and restore on sheet-open.

**Prevention**:

- Build a shared "user preference store" (localStorage-first, optionally synced to per-user Firestore doc) — cross-component opportunity #3 in COMPONENTS.md.
- Apply to tracker (layer presets), spotting (report drafts), profile (settings).

---

### [2026-08-13] spotting: No Query-Param Binding for 7 Features (Cross-Component)

**Problem**: Seven of nine features independently proposed syncing local signal state to URL for shareability, but the app has **zero** existing query-param-binding pattern.

**Root Cause**: No reusable "sync a signal ↔ a query param" utility exists. Each feature would need to invent the wiring from scratch.

**Fix**: Not yet implemented. Cross-component opportunity #1 in COMPONENTS.md — the single most-repeated ask.

**Prevention**:

- Build the shared utility once, apply to all 7 features: gallery (copy-link from viewer), gdpr (deep-link to item), about (deep-linkable sections), spotting (URL-synced filters/sort), console (shareable filter views), insiden (deep-linkable incident expand), tracker (shareable map/layer views).

---

## profile

### [2026-08-13] profile: No User Preferences/Persistence Service

**Problem**: Profile's proposed settings sub-page needs somewhere to store preferences. No localStorage wrapper, per-user Firestore-doc pattern, or generic persistence service exists in the app.

**Root Cause**: The only existing persistence is the upload queue's IndexedDB (upload-specific). Three features (tracker, spotting, profile) independently need this.

**Fix**: Not yet implemented. Cross-component opportunity #3 in COMPONENTS.md.

**Prevention**:

- Build a shared `UserPreferenceService` (localStorage-first, optional Firestore sync) as a core service.
- Inject like `GraphQLClient` or `ToastService` — one service, three features unblocked.

---

### [2026-08-13] profile: No Export Utility for Spotting History

**Problem**: Users cannot download their spotting history as CSV/JSON. The data is already resident client-side in `_eventsSignal`.

**Root Cause**: No shared `core/export` utility. Four features need this (profile, console, insiden, gallery).

**Fix**: Not yet implemented. Cross-component opportunity #2 in COMPONENTS.md.

**Prevention**:

- Build shared export utility once.
- Add "Export" as standard capability for any user-data list view.

---

## insiden

### [2026-08-13] insiden: Per-Incident UI State Not Reflected in URL

**Problem**: `detailsExpanded` and `photosExpanded` in `IncidentCardComponent` are local component signals, not reflected in the URL. Users cannot share a link to an expanded incident.

**Root Cause**: Day selection already round-trips through URL (`daySelected` → `router.navigate(["/insiden", dateKey])`), but per-incident expand state was not extended to the route.

**Fix**: Not yet implemented. Requires extending the route with an incident-id fragment/query param synced to local signals.

**Prevention**:

- Treat all significant UI state (expanded rows, selected tabs, open modals) as URL-state candidates.
- Use the shared URL-sync utility (cross-component opportunity #1) when available.

---

### [2026-08-13] insiden: No iCal Export Utility for Incidents

**Problem**: Users cannot export incidents as `.ics` calendar feed. `CalendarIncident` already carries start/end datetime, title, brief — enough for standards-compliant iCal.

**Root Cause**: No shared export utility. Four features need this.

**Fix**: Not yet implemented. Cross-component opportunity #2 in COMPONENTS.md.

**Prevention**:

- Build shared `.ics` generator in `core/export`.
- Add "Add to calendar" / "Export iCal" as standard for any date-based list.

---

## tracker

### [2026-08-13] tracker: No Persistence Layer for Saved/Favorite Layer Presets

**Problem**: The draft/applied/undo signal triplet in `LayerSelectionService` is the natural seam for "save this checkbox combination as a preset," but there's no persistence layer — everything resets to `layer-config.ts` defaults on reload.

**Root Cause**: No localStorage, user profile, or Firestore doc backing any tracker state.

**Fix**: Not yet implemented. Requires a new small persistence service (localStorage-first; Firestore CMS doc keyed by user would match patterns used elsewhere).

**Prevention**:

- Build the shared `UserPreferenceService` (cross-component opportunity #3) and apply to tracker.
- Design state services with persistence as a pluggable concern from the start.

---

### [2026-08-13] tracker: No Shareable/Deep-Linkable Map Views

**Problem**: Users cannot share a link to a specific map view (active layers, viewport). `LayerSelectionService`'s applied signals represent the source of truth but are not synced to query params.

**Root Cause**: No query-param-binding pattern exists in the app (cross-component opportunity #1).

**Fix**: Not yet implemented. Listed as "small additive change — no new state model needed, just a sync point."

**Prevention**:

- Apply shared URL-sync utility to `LayerSelectionService`'s applied signals.
- Include map viewport (center, zoom) in the synced state.

---

## gallery

### [2026-08-13] gallery: No Copy-Link Affordance from Viewer

**Problem**: The route already syncs `selectedMedia` to `/gallery/:mediaId`, but `MediaViewerComponent` has no "copy link" button.

**Root Cause**: Missing UI affordance for an already-working URL-sync mechanism.

**Fix**: Not yet implemented. Listed as "small additive change with no new state or backend work."

**Prevention**:

- When implementing URL-sync for a view, always add a "copy link" / "share" action as part of the same PR.
- Make shareability a default requirement for any deep-linkable view.

---

### [2026-08-13] gallery: No Bulk-Download Utility for Year's Photos

**Problem**: Users cannot download all photos from a year as a zip. Each `MediaNode` carries `file.url`, but no zip/bundling service or download-progress UI exists.

**Root Cause**: No multi-file download orchestration in the app. Client-side zipping may be impractical for large galleries; backend batch-export endpoint may be needed.

**Fix**: Not yet implemented. Requires new utility/service (fetch-and-zip in browser, or backend batch-export endpoint).

**Prevention**:

- Consider bulk-download as a standard capability for any paginated media gallery.
- Evaluate client-side vs. server-side bundling early based on expected data volume.

---

## Cross-Component Systemic Issues

### [2026-08-13] All: No Shared Query-Param Binding Utility (7 Features Blocked)

**Problem**: Seven features (gallery, gdpr, about, spotting, console, insiden, tracker) independently need URL-state sync, but the app has **zero** existing query-param-binding pattern.

**Root Cause**: No reusable "sync a signal ↔ a query param" utility. Only path params are wired via Angular's component-input-route-binding.

**Fix**: Not yet implemented. Cross-component opportunity #1 in COMPONENTS.md — the single most-repeated ask.

**Prevention**:

- Build `syncSignalWithQueryParam` composable in `core/composables/`.
- Handle: encoding/decoding, default omission, browser-only writes, SSR safety.
- Apply to all 7 features in a single coordinated effort.

---

### [2026-08-13] All: No Shared Export Utility (4 Features Blocked)

**Problem**: Four features (profile, console, insiden, gallery) independently want client-side export (CSV/JSON/iCal/bulk download), but no shared utility exists.

**Root Cause**: Each feature would implement its own serializer. Data is already resident client-side in all cases.

**Fix**: Not yet implemented. Cross-component opportunity #2 in COMPONENTS.md.

**Prevention**:

- Build `core/export` with: `toCSV<T>()`, `toJSON<T>()`, `toICS(events)`, `downloadBlob(blob, filename)`.
- Add as a standard capability for any data-table/media-grid component.

---

### [2026-08-13] All: No Shared User Preferences/Persistence Service (3 Features Blocked)

**Problem**: Tracker (layer presets), spotting (report drafts), and profile (settings) all need a persistence layer, but none exists.

**Root Cause**: Only existing persistence is upload-queue IndexedDB (upload-specific). No localStorage wrapper or per-user Firestore-doc pattern.

**Fix**: Not yet implemented. Cross-component opportunity #3 in COMPONENTS.md.

**Prevention**:

- Build `UserPreferenceService` in `core/services/` with: `get(key)`, `set(key, value)`, `watch(key)`, optional Firestore sync.
- Design as a generic key-value store, not feature-specific.

---

### [2026-08-13] All: No Shared AI/LLM Gateway (9 Features Blocked)

**Problem**: Every one of the 9 feature docs independently proposes an LLM/embedding-based feature, but there is no AI infrastructure — no `core/ai` service, no LLM API client, no embeddings store.

**Root Cause**: AI features were proposed in isolation without a shared infrastructure plan.

**Fix**: Not yet implemented. Cross-component opportunity #5 in COMPONENTS.md.

**Prevention**:

- Before building any AI feature, establish a provider-agnostic `AiGatewayService` (auth, rate-limiting, caching, streaming).
- All features inject the same gateway — no bespoke integrations.

---

## Fixed Items Summary

| Date       | Component        | Issue                                                           | Commit   |
| ---------- | ---------------- | --------------------------------------------------------------- | -------- |
| 2026-08-24 | console          | adminOnlyGuard always returns true                              | 29b5d6d  |
| 2026-08-24 | gdpr, about      | Firestore silent failure (error callback only clears isLoading) | ba95758  |
| 2026-08-24 | console, profile | Bulk-action pattern extracted to `useBulkActions` composable    | 873202f* |

*Commit inferred from git log — "refactor(profile): show privacy settings as a modal sourced from loaded preferences" (873202f) and related bulk-action extraction work.

---

## Prevention Checklist for Future Work

- [ ] **Security**: Never leave guards in pass-through state. Track as blocking issue.
- [ ] **Error Handling**: Every async subscription must have error signal + error UI + retry.
- [ ] **URL State**: Build shared `syncSignalWithQueryParam` composable before adding filters to any view.
- [ ] **Export**: Build shared `core/export` before adding export to any feature.
- [ ] **Persistence**: Build shared `UserPreferenceService` before adding settings/drafts to any feature.
- [ ] **AI**: Build shared `AiGatewayService` before any AI feature.
- [ ] **Code Review**: Check for duplicate patterns across features — extract to core on second occurrence.
- [ ] **Documentation**: Update component docs when fixing systemic issues so future audits don't re-discover.
