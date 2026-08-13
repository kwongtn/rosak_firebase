# System Component Registry & Architecture Map

_Compiled from `docs/components/*.md` (Phase 1 per-feature audits) — covers all 9 top-level features under `src/app/features/`._

## 🗺️ High-Level System Topology

The app is a single Angular (standalone components, Signals-first) frontend with three parallel backend integrations — no feature talks to more than one of these at once, but several features straddle two:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Angular Feature Pages (src/app/features/*)                             │
│  gallery · gdpr · about · spotting · profile · console · insiden ·      │
│  tracker · not-found                                                    │
└───────┬───────────────────┬───────────────────┬─────────────────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────────────┐
│ Shared Core    │   │ Firebase SDK   │   │ External / static feeds   │
│ Services       │   │ (direct)       │   │                            │
│ (src/app/core) │   │                │   │                            │
│                │   │                │   │                            │
│ GraphQLClient /│   │ Firestore      │   │ GTFS-realtime protobuf     │
│ graphqlResource│   │ onSnapshot     │   │ feeds (per-operator)       │
│ AuthService    │   │ (public/gdpr,  │   │ GTFS-static stops.txt      │
│ RecaptchaService│  │  public/about) │   │ (via /api/gtfs-proxy,      │
│ ImageUploadSvc │   │ Firebase       │   │ CORS workaround)           │
│ (+IndexedDB Q) │   │ Storage        │   │ Railway GeoJSON overlay    │
│ ThemeService   │   │ (tracker       │   │ (Firebase Storage)         │
│ observeHeight  │   │  railway file) │   │ thecatapi/dog.ceo (404 pg) │
└───────┬────────┘   └────────────────┘   └────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Django / Strawberry GraphQL    │   one legacy REST endpoint:
│ backend (rosak_backend)        │◄──operation/line_vehicles_status_
│ spotting · profile · console · │   trend_count (spotting's
│ insiden query/mutate here      │   VehicleStatusTrendComponent —
└────────────────────────────────┘   no GraphQL equivalent exists yet)
```

**Cross-cutting UI layers** consumed by nearly every feature regardless of backend: `src/app/ui/*` (Spartan/Helm styled primitives — button, badge, skeleton, sheet, table, toast…), `src/app/domain-ui/*` (status badges, activity heatmap — thin wrappers around the shared enums in `core/graphql/types.ts`), and `src/app/shell/*` (`AppNavComponent`/`AppFooterComponent` page chrome).

**Two content models coexist by design:**

- **GraphQL-backed, dynamic:** spotting, profile, console, insiden — user/admin-generated data, queried live from the Django backend.
- **Firestore-backed, hand-edited CMS:** gdpr, about — single documents (`public/gdpr`, `public/about`) edited directly by an admin outside the app, streamed via `onSnapshot`. Structurally identical pattern in both (private `_data` signal + `computed()` projections + manual subscribe/`ngOnDestroy` unsubscribe).
- **tracker** is the outlier: no app backend involvement at all — it polls third-party GTFS feeds directly and treats the Django backend as irrelevant.
- **gallery** and **not-found** are the two purely read/decorative leaves — gallery reads the GraphQL backend read-only with no mutations; not-found doesn't touch the app backend at all beyond cosmetic third-party image APIs.

## 📚 Component Catalog

| Component Name | Layer/Location                                                                                                    | Core Responsibility                                                                                                                                                | Key Dependencies                                                                                                                                  | Primary Extension Point                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **gallery**    | Angular Presentation, `features/gallery/` (page + 3 child components + pure utils)                                | Paginated, year-grouped public photo feed with a full-screen lightbox viewer, driven by a Relay-style GraphQL connection                                           | `graphqlResource`/`GraphQLClient`, `ToastService`, Hlm button/skeleton, shell chrome                                                              | Reusable `JustifiedGridComponent`/`MediaViewerComponent` (pure input/output, no gallery coupling); pure `computeJustifiedRows()`/`getImgurThumbnail()` utils       |
| **gdpr**       | Angular Presentation, `features/gdpr/` (single page)                                                              | Read-only GDPR compliance checklist rendered from a hand-edited Firestore doc                                                                                      | `firebase/firestore` (`public/gdpr`, direct SDK), `HlmBadge`/`HlmSkeleton`, shell chrome                                                          | `GdprDetail`/`GdprDetailChild` schema is additive; new checklist fields need no component changes                                                                  |
| **about**      | Angular Presentation, `features/about/` (single page)                                                             | Read-only About page (project blurb, sub-projects, personnel, tech stack) from a hand-edited Firestore doc                                                         | `firebase/firestore` (`public/about`), Hlm Card/Badge/Button/Skeleton, shell chrome                                                               | Schema-driven `@for` rendering over `display`-flagged arrays; `STATUS_VARIANT` lookup table for new project statuses                                               |
| **spotting**   | Angular Presentation (flagship, default route), `features/spotting/` (7 subcomponent groups + route-scoped store) | Crowd-sourced train/rolling-stock spotting log: browse per-line fleet/history/incidents, submit new spotting reports                                               | `graphqlResource`/`GraphQLClient`, `AuthService`, `ImageUploadService`/compression, `@angular/forms/signals`, domain-ui badges/heatmap            | `ReportSheetService` (cross-page sheet trigger seam); `report-form.schema.ts` (declarative validation); `spotting.queries.ts` (single GraphQL contract seam)       |
| **profile**    | Angular Presentation, `features/profile/` (page + 2 child components)                                             | Signed-in user's dashboard: identity, editable nickname, spotting stats/heatmap, deletable spotting history                                                        | `GraphQLClient`, `AuthService`, `RecaptchaService`, `domain-ui` heatmap/badges                                                                    | `data/profile.queries.ts` single seam for query/type changes; `isOwnProfile` branch already wired as a placeholder for a future by-id public-profile backend field |
| **console**    | Angular Presentation (admin-only), `features/console/` (single page)                                              | Admin moderation queue for crowd-submitted spotting events — filter, paginate, bulk mark-as-read                                                                   | `GraphQLClient`, `AuthService`, `adminOnlyGuard` (⚠️ currently disabled), `ReCaptchaV3Service`                                                    | `FilterFormModel`/`buildFilters()` additive per-field pattern; `selectMode`+`checkedIds` generic bulk-action pattern                                               |
| **not-found**  | Angular Presentation, `features/not-found/` (single page)                                                         | Catch-all 404 with SSR-correct HTTP status and deterministic per-URL joke messaging                                                                                | `Router`/`Location`, `LineStatusBadge`, shell chrome, cat/dog public image APIs                                                                   | `NOT_FOUND_MESSAGES` static content pool; pet-photo block isolated behind `@if`/platform guard                                                                     |
| **insiden**    | Angular Presentation, `features/insiden/` (page + 2 child components)                                             | Public read-only incident calendar (line/vehicle/station disruptions) with day-scoped list + long-running-incident pinning; photo attachment is the one write path | `graphqlResource`, `ImageUploadService`, `PhotoPickerComponent` (reused from spotting), `ngx-markdown`                                            | `insiden.queries.ts` single flat-query seam; `SEVERITY_*`/`CHRONOLOGY_DOT` lookup tables; `RetryableResource` structural interface                                 |
| **tracker**    | Angular Presentation, `features/tracker/` (shell + map + status-card + info-panel, 4 root-provided services)      | Full-bleed live WebGL map of GTFS-realtime transit vehicles + GTFS-static stops + railway overlay, with opt-in layers via draft/Apply flow                         | `GtfsRealtimeService`/`GtfsStaticService`/`LayerSelectionService`/`GeojsonStorageService` (root), `@antv/l7`, Firebase Storage, `/api/gtfs-proxy` | `layer-config.ts` checkbox catalogs (data-only new-feed addition); `InfoPanelKind` union; draft/applied/undo signal-triplet contract in `LayerSelectionService`    |

## 🎯 Cross-Component Feature Opportunities

1. **Unified "service health" AI digest (spotting + insiden + tracker).** All three independently proposed the same shape of feature in isolation: spotting wants anomaly/incident triage over vehicle status history, insiden wants incident summarization, tracker wants delay/anomaly summarization over live GTFS feeds. These three already share the same status/severity vocabulary (`core/graphql/types.ts` enums, `domain-ui` badges) — a single cross-feature "what's happening right now" summary component could pull from all three and surface on a shared landing/home surface, rather than three independent one-off summarizers.

2. **One shared AI vision pipeline for uploaded photos (gallery + spotting + insiden).** `ImageUploadService`/`ImageCompressionService` is already the single shared upload queue behind spotting's report-form photos, insiden's incident photos, and (indirectly) gallery's bot-ingested media. Each feature's doc independently proposed captioning/duplicate/moderation AI — building it once at the `ImageUploadService` layer (pre- or post-upload hook) gets alt-text generation, duplicate detection, and moderation for all three features and for console's manual review queue, instead of three bespoke integrations.

3. **Low-hanging fruit — fix `adminOnlyGuard` and reuse the fix pattern.** `console`'s admin guard currently always returns `true` (the real `auth.isAdmin()` check is commented out with a `TEMPORARY` note) — the guard's own doc flags this as a one-line fix once the Firebase `admin` custom claim is reliably granted server-side. This is the single highest-value low-effort item in the whole catalog: it's a real, unauthenticated-reachable admin route today, and the fix is already scoped and isolated at the routing layer with no page-level changes needed.

4. **Low-hanging fruit — shared "CMS AI editor" for gdpr + about.** Both features are structurally identical (single hand-edited Firestore doc, `_data` signal + `computed()` projections, no in-app editing UI) and both independently proposed an AI drafting/rewriting assistant for their admin-edited content. Because the pattern is already duplicated 1:1 between the two features, a single shared admin-facing "Firestore doc AI editor" tool (schema-aware, works against `PublicGdprDocument`/`PublicAboutDocument`) would cover both with no changes to either page component.

5. **Missing component — no shared AI/LLM gateway exists at all.** Every one of the 9 feature docs independently proposes an LLM- or embedding-based feature (captioning, summarization, anomaly detection, NL query parsing, conversational form-fill), and none of them has any AI infrastructure to build on today — there is no `core/ai` service, no LLM API client, no embeddings store. Before any of the above ideas (or the individual per-feature AI opportunities in each doc) are buildable, the single missing system component is a shared, provider-agnostic LLM/embedding gateway service (auth, rate-limiting, caching) that every feature could inject the same way they inject `GraphQLClient` or `ToastService` today.

## 🛠️ Cross-Component Feature Opportunities (Non-AI)

Synthesized from each feature doc's own `💡 Potential Feature Opportunities` section (non-AI ideas each feature is structurally ready — or nearly ready — to support).

1. **Universal URL-state sync layer — the single most-repeated ask in the whole catalog.** Seven of nine features independently proposed syncing some piece of local signal state to the URL for shareability: gallery (copy-link from the viewer), gdpr (deep-link to one compliance item), about (deep-linkable sections), spotting (URL-synced filters/sort), console (shareable/saved filter views), insiden (deep-linkable per-incident expand state), and tracker (shareable map/layer views). None of them exist today, and — confirmed across every doc — the app has **zero** existing query-param-binding pattern anywhere; only path params are wired up (via Angular's component-input-route-binding). A single reusable "sync a signal ↔ a query param" utility, built once, would unblock all seven features at once instead of seven bespoke implementations.

2. **Shared client-side export utility (profile, console, insiden, gallery).** Four features independently want to let users get their already-fetched data out of the app: profile (CSV/JSON of spotting history), console (CSV of the filtered moderation queue), insiden (iCal export of incidents), and gallery (bulk photo download per year). In every case the data is already resident client-side in a component signal, with no backend/query changes needed — a shared `core/export` utility (a CSV/JSON serializer plus one `.ics` generator) would replace four one-off implementations with one well-tested shared module.

3. **Missing shared component — a user-preferences/persistence service (tracker, spotting, profile).** Tracker wants saved/favorite layer presets, spotting wants persisted report-form drafts (so closing the sheet by accident doesn't lose the in-progress report), and profile's proposed settings sub-page would need somewhere to store preferences. All three docs independently note the same gap: there is no localStorage wrapper, per-user Firestore-doc pattern, or any generic persistence service anywhere in the app today (the only existing persistence is the upload queue's IndexedDB, which is upload-specific). One small shared "user preference store" (localStorage-first, optionally synced to a per-user Firestore doc later) would unblock all three.

4. **Low-hanging fruit — fix the duplicated Firestore "silent failure" bug (gdpr + about).** Both Firestore-backed CMS features have the exact same, independently-discovered gap: the `onSnapshot` error callback only clears `isLoading`, so a genuine read failure renders identically to an empty document with no user-visible distinction and no retry. Since both features already share an identical `_data` signal + `computed()` projection subscription pattern, the fix (an `isError`/`hasError` signal set from that same callback, plus one new `@if` branch per page) is nearly copy-pasteable between the two — the cheapest, most tightly-scoped item in this entire document.

5. **Low-hanging fruit — extract the "select rows, then act" bulk-action pattern (console + profile).** Console's existing `selectMode` + `checkedIds` pattern (a `Set<string>` of checked ids plus a mode toggle) is already flagged in its own doc as reusable, and profile independently proposes the identical shape for bulk-deleting spotting entries. Extracting this once — as a small composable/directive, not a full component — would give both features, and any future admin or list view in the app, bulk actions for free instead of re-deriving the same three signals per feature.

## ⚠️ Unclear Components / Need Re-Audit

None. All 9 component docs produced concrete interface definitions, internal-state breakdowns, and at least 3 named extension points — no doc was ambiguous or lacking a clear seam. One item worth flagging for awareness rather than re-audit: **console**'s `adminOnlyGuard` is a known, self-documented security gap (guard always passes) rather than a documentation gap — see Opportunity #3 above.
