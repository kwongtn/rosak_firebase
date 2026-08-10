# Compliance

## Path(s) & Routing

- **URL**: `/compliance`
- **Route definition**: `src/app/app-routing.module.ts:176-184`
    ```ts
    {
        path: "compliance",
        title: "MLPTF | Compliance",
        loadComponent: () => {
            return import("./compliance/compliance.component").then(
                (c) => c.ComplianceComponent
            );
        },
    },
    ```
- **Page `<title>`**: `"MLPTF | Compliance"` (set via Angular Router's `title` property, uses the built-in `Title` strategy — no custom `TitleStrategy` override for this route).
- **Lazy-loaded entry point**: `ComplianceComponent`, standalone component, `src/app/compliance/compliance.component.ts`. Loaded via `loadComponent` (not `loadChildren`), so there is no child-route table under `/compliance` — it is a single flat route with no sub-paths (e.g. no `/compliance/:something`).
- **Route guards**: **none**. Unlike `console` (`canActivate(adminOnly)`), `profile` (`canActivate(redirectUnauthorizedToSpotting)`) or `situasi` (`canActivate(betaTesterOnly)`), the `compliance` route object has no `canActivate`/`canMatch` entry at all — it is reachable by anyone, authenticated or not (`app-routing.module.ts:56-66` defines the guard functions used elsewhere; `compliance` uses none of them).
- **Maintenance-mode switch**: **none**. The `maintenance` object (`app-routing.module.ts:32-54`) only has entries for `spotting`, `insiden`, `profile`, `console`, `gallery`, `situasi`, `tracker` — there is no `compliance` key, so there is no construction/placeholder fallback for this route; it always resolves to `ComplianceComponent`.
- **Redirect rules**: none targeting or originating from `/compliance`.
- **App shell / layout behavior**: `/compliance` is not listed in `noApplyPaddingRoutes` (`["situasi", "tracker"]`) or `noApplyTopMarginRoutes` (`["tracker"]`) in `src/app/app.component.ts:52-53`, so it renders with the default padded shell (`applyPadding = true`, `applyTopPadding = true`): wrapped in `.content-outer-container > .content-inner-container` and the global `<app-footer>` is shown below it (`src/app/app.component.html:15-40`).
- **Not present in the main nav menu**: `initialMenuList` in `src/app/app.component.ts:18-50` only contains Gallery, Insiden, TranSPOT, and About. There is no "Compliance" entry added there or anywhere else in the header/footer templates (confirmed via repo-wide grep for `compliance`/`routerLink.*compliance` — only hit is the route table itself and the component that renders under it). **The page is only reachable by knowing/typing the `/compliance` URL directly** (or a link from outside the app, e.g. an email/footer link on another surface not in this repo).

## Purpose

This is the app's GDPR compliance/legal-disclosure page — a read-only, publicly-accessible statement of which GDPR principles the MLPTF ("Malaysia Land Public Transport Fans") community platform adheres to (or doesn't), with supporting explanation. Despite the generic route name "Compliance", the only content rendered under it today is GDPR-specific (`<h1>GDPR</h1>` is hard-coded — see Functionality section); there is no PDPA-specific content, terms-of-service, or privacy-policy content in this route as currently implemented. It requires no authentication and no role, and is not linked from the app's main navigation — it functions as a standalone legal/trust page for anyone who is given the direct URL (e.g. for compliance/audit purposes, or linked from an app store listing or footer elsewhere).

## Component Tree

- **`ComplianceComponent`** — `src/app/compliance/compliance.component.ts` (selector `app-compliance`, standalone)
    - Pure layout wrapper. `ngOnInit` and constructor are both empty no-ops (`compliance.component.ts:13-19`).
    - Template (`compliance.component.html`) is a single `<div class="main-container">` wrapping `<compliance-gdpr></compliance-gdpr>` — no inputs/outputs passed.
    - Styling (`compliance.component.scss`): fixed margins only — `margin-top: 0px; margin-bottom: 50px; margin-left: 30px; margin-right: 30px;` (`compliance.component.scss:1-6`). No responsive breakpoints/media queries.
    - No child components other than `GdprComponent`.
- **`GdprComponent`** — `src/app/compliance/gdpr/gdpr.component.ts` (selector `compliance-gdpr`, standalone)
    - Does all the real work: subscribes to a single Firestore document in its constructor and renders the resulting content.
    - Imports `CommonModule` and ng-zorro's `NzCollapseModule` (the only ng-zorro dependency in this feature — relevant for the Tailwind rewrite since it's the one thing that needs a replacement, e.g. a `<details>`-based or custom disclosure/accordion widget).
    - No inputs/outputs (it is used with zero bindings from its parent) and no router params are read.
    - No further child components — the nz-collapse panels are rendered inline via `@for` loops directly in `gdpr.component.html`, not extracted into a "detail panel" sub-component.
    - `gdpr.component.scss` is an **empty file** (0 bytes) — no component-scoped styling exists for this feature; all visual presentation currently comes from ng-zorro's default collapse styling plus whatever global/ambient styles apply to `<h1>`, `<h2>`, `<p>`, `<hr>`.

Data flow: `Firestore` (injected via DI, `@angular/fire/firestore`) → `GdprComponent` constructor → component instance fields (`definition`, `intro`, `details`) → template interpolation/`[innerHTML]`. There is no service layer in between; the Firestore call is made directly inside the component constructor.

## Functionality & Behavior

**Data source and load sequence** (`gdpr.component.ts:34-57`):

1. In the constructor, `onSnapshot(doc(firestore, "public", "gdpr"), callback)` opens a **real-time listener** on the single Firestore document at path `public/gdpr` (not a one-shot `getDoc`). Any change made to that document while the user has the page open will live-update the rendered content without a page reload.
2. If the doc exists, it's cast to `PublicGdprDocument` and:
    - `definition` ← `items.definition ?? ""`
    - `intro` ← `items.intro ?? ""`
    - `details` ← `items.details` mapped into `GdprDetailPanel[]`, where every child under every top-level detail group gets an extra `isCollapsed` UI-only field initialized to `!true` → **`false`**, meaning **every collapse panel starts expanded/open by default** (`gdpr.component.ts:44-51`).
    - `showLoading` is set to `false`.
3. If the doc does **not** exist, none of the above runs — `definition`/`intro` stay at their initial `""`, `details` stays `[]`, and `showLoading` stays `true` forever. There is no `else` branch and no error callback passed to `onSnapshot`, so a missing document, a permission-denied error, or any listener error is **silently swallowed** — the user just sees an empty page under the `<h1>GDPR</h1>` heading with no error message, spinner, or retry affordance.

**Rendering** (`gdpr.component.html`):

- `<h1>GDPR</h1>` — hard-coded literal, not sourced from Firestore.
- `<p [innerHTML]="definition"></p>` and `<p [innerHTML]="intro"></p>` — rendered as raw HTML (subject to Angular's default `DomSanitizer` sanitization since there is no `bypassSecurityTrustHtml` anywhere in this feature; unsafe tags/attributes such as `<script>`, inline event handlers, etc. would be stripped by Angular before display). If both are empty strings (doc missing, or fields absent), these render as empty paragraphs.
- `@for (elem of details; track elem)` — for each top-level detail group:
    - `<h2>{{ elem.title }}</h2>` — plain-text interpolation (NOT innerHTML), unlike `definition`/`intro`.
    - `@for (child of elem.children; track child)` — for each child item, one `<nz-collapse><nz-collapse-panel>` pair (i.e. **each child renders its own separate single-panel `nz-collapse`**, rather than one `nz-collapse` per group containing multiple panels — worth noting for the Tailwind rewrite, since grouping multiple children under one accordion container would be a behavior-preserving simplification, not a behavior change, as long as independent open/close state per child is kept).
        - Panel header (`ng-template #headerTpl`): `{{ child.title }} {{ child.adhered ? "✅" : "❌" }}` — shows the sub-item's title plus a checkmark or cross emoji indicating whether MLPTF adheres to that specific GDPR point.
        - Panel body: `<div [innerHTML]="child.details"></div>` — raw HTML, sanitized by Angular.
        - If `child.notes` is present and not an empty string (`gdpr.component.html:16`: `@if (!(child.notes === "" || child.notes === undefined))`), an `<hr/>` plus `<div [innerHTML]="child.notes"></div>` is appended below the details — an optional "notes" callout per sub-item.
    - Panel open/closed state: `[nzActive]="!child.isCollapsed"` — so the panel is expanded when `isCollapsed` is `false` (the initial state for all panels, per above). `(nzActiveChange)="toggle(!$event, child)"` — when the user clicks a panel header, ng-zorro emits the panel's new active (open) state as `$event`; the template negates it before calling `toggle`, and `toggle()` (`gdpr.component.ts:63-65`) just assigns that value straight to `child.isCollapsed`. Net effect: clicking to open a panel (`$event = true`) sets `isCollapsed = false`; clicking to close it (`$event = false`) sets `isCollapsed = true` — behaviorally correct, but written with a redundant double negation (`!$event` in the template, then a straight assignment in the handler) that a rewrite can simplify to a single boolean flip.
    - Each child's expand/collapse state is independent and purely client-side/in-memory — **not persisted** anywhere (not to Firestore, not to localStorage); a page refresh resets every panel back to "open" (the initial default), even if the user had manually collapsed some.

**No user input, forms, filters, sorting, pagination, or search** — this is a pure read-only informational page. The only interactivity is expanding/collapsing the per-item detail panels described above.

**Loading state**: `showLoading` is declared and toggled (`true` → `false` on successful snapshot) but is **never read anywhere in the template** — there is no spinner, skeleton, or conditional wrapper gated on it (confirmed by inspecting the full contents of `gdpr.component.html`, which has zero references to `showLoading`). This is effectively dead state — see Known Quirks.

**Empty/error states**: no explicit empty-state or error-state UI. If `details` is `[]` (either because the field is absent on the document, or the document itself doesn't exist), the page shows just the `<h1>GDPR</h1>` heading and two empty `<p>` tags with nothing below.

## Data & API Contracts

**No GraphQL usage whatsoever.** This feature does not call the Django/Strawberry backend at all — confirmed by reading every file under `src/app/compliance/**` (no `gql` tagged templates, no Apollo imports, no calls into `src/app/models/query`/`mutation.ts`) and by grepping the backend repo (`/home/kwongtn/rosak_backend`) for `gdpr`/`compliance` across all Python files, which returns zero matches. The rewrite does not need to trace any backend resolver for this area.

**Firebase Firestore** (`@angular/fire/firestore`) is the sole data source:

- **Read**: real-time listener via `onSnapshot(doc(firestore, "public", "gdpr"), callback)` (`gdpr.component.ts:35-56`). Document path: **`public/gdpr`** (top-level `public` collection, document id `gdpr`).
- **Shape consumed** (`src/app/compliance/models/firestore.ts`), interpreted as the `PublicGdprDocument` TypeScript interface (this is a client-side type assertion, `doc.data() as PublicGdprDocument` — **not validated at runtime**, so if the actual document in Firestore doesn't match this shape, fields will simply be `undefined` and fall back to the `?? ""` / `?? []` defaults rather than throwing):
    ```ts
    interface PublicGdprDocument {
        definition: string;
        intro: string;
        details: GdprDetail[];
    }
    interface GdprDetail {
        title: string;
        children: GdprDetailChildren[];
    }
    interface GdprDetailChildren {
        adhered: boolean;
        details: string;
        notes: string | undefined;
        title: string;
    }
    ```
- **Write**: none. This feature never writes to Firestore — it is read-only. (There is no visible admin/console UI in this repo for editing the `public/gdpr` document either — content is presumably maintained directly via the Firebase console or a separate tool, out of scope of this repo.)
- **Firestore security rules**: **not present in this repo** — no `firestore.rules` file exists anywhere under `/home/kwongtn/rosak_firebase` (confirmed via repo-wide search; `firebase.json` only configures **hosting** targets, no `firestore` rules/indexes section). Whether unauthenticated reads of `public/gdpr` are actually allowed by the deployed Firestore security rules cannot be confirmed from this repo — see Open Questions. The `public` collection name strongly implies it's intended to be publicly readable without auth, and the component makes no attempt to check `AuthService`/auth state before subscribing, consistent with that assumption.
- **Firestore client init**: `provideFirestore(() => getFirestore())` in `src/app/app.module.ts:29,93` — default Firestore instance for whichever Firebase project is configured in `src/environments/environment*.ts` (not re-documented here per scope; see that file directly, and `.firebaserc` which maps the `default`/`rosak-7223b` project to `staging-rosak`/`rosak-7223b` hosting targets).

**No REST calls, no Firebase Auth/Storage/Analytics usage, and no browser storage (localStorage/sessionStorage/IndexedDB) reads or writes** anywhere in `src/app/compliance/**`.

## State Management

- No Angular services, RxJS Subjects, or signals are defined or consumed within this feature beyond the one `Unsubscribe` handle returned by `onSnapshot`.
- All state is local component instance fields on `GdprComponent`: `showLoading`, `items`, `definition`, `intro`, `details`. None of it is shared with, or read from, any other part of the app (no injected shared service).
- **Lifecycle**: the Firestore listener is opened in the constructor (i.e. as soon as `GdprComponent` is instantiated — there's no explicit "load" trigger) and torn down in `ngOnDestroy` via the stored `unsubscribe` function (`gdpr.component.ts:67-71`), which correctly prevents listener leaks when the user navigates away from `/compliance`. Because it's a live `onSnapshot` (not a one-shot fetch), the component's fields are refreshed automatically for as long as the component stays mounted, with no manual refresh/invalidate action available or needed.
- Per-child `isCollapsed` UI state (see Functionality) lives only on the in-memory `details` array and is rebuilt from scratch (always `false`/expanded) every time a new snapshot arrives — so even a Firestore document update while the page is open will reset all panels to expanded, discarding any manual collapse the user had done.

## Permissions, Roles & Flags

- **Route guard**: none. No `canActivate`, no `hasCustomClaim` check, no `redirectUnauthorizedTo` — confirmed in `app-routing.module.ts:176-184` (contrast with `console` which uses `adminOnly`, `profile` which uses `redirectUnauthorizedToSpotting`, `situasi` which uses `betaTesterOnly`).
- **Template-level checks**: none. `compliance.component.html` and `gdpr.component.html` contain no `*ngIf`/`@if` gated on auth state, roles, or feature flags.
- **Backend/resolver-level checks**: not applicable — there is no backend call in this feature (see Data & API Contracts).
- **Firestore-level enforcement**: unknown/unverifiable from this repo (no rules file checked in — see Open Questions). This is the only place enforcement could plausibly exist for this feature, and it cannot be confirmed either way from source.
- **Net assessment**: as implemented in this repo, `/compliance` is intended to be fully public — no role or auth requirement is enforced anywhere in the frontend, consistent with it being a legal-disclosure page that arguably should be visible to logged-out visitors.

## Known Quirks / Tech Debt

- **`showLoading` is dead state.** It's declared, initialized to `true`, and set to `false` on successful snapshot (`gdpr.component.ts:25,53`), but is never referenced in `gdpr.component.html`. There is no loading spinner/skeleton — the page just silently shows empty content until (if ever) the snapshot resolves. A rewrite should decide whether to actually wire this up (e.g. show a skeleton while `showLoading`) or remove it.
- **No error handling on the Firestore listener.** `onSnapshot(doc(...), successCallback)` is called with only a success callback — no error callback, no `catchError`, no try/catch. A missing document, a Firestore permission-denied error, or a network failure all result in the exact same silent "stuck on empty page" state, indistinguishable from a slow-but-successful load. Verified: `gdpr.component.ts:35-56`.
- **`compliance.component.spec.ts` is broken under Angular 18's standalone-component testing rules — confirmed by running it.** It calls `TestBed.configureTestingModule({ declarations: [ComplianceComponent] })`, but `ComplianceComponent` is `standalone: true`. Running `ng test --include='src/app/compliance/**/*.spec.ts'` reproduces the failure:
    ```
    Error: Unexpected "ComplianceComponent" found in the "declarations" array of the "TestBed.configureTestingModule" call,
    "ComplianceComponent" is marked as standalone and can't be declared in any NgModule - did you intend to import it instead?
    ```
    It should use `imports: [ComplianceComponent]` instead, matching the pattern already used in `gdpr.component.spec.ts` (`imports: [GdprComponent]`, `gdpr.component.spec.ts:13`). File: `src/app/compliance/compliance.component.spec.ts:10-12`. This predates the current session and is unrelated to the ng-zorro migration work in recent commits (that work fixed _other_ components' TestBed setups; this one was apparently missed).
- **`gdpr.component.spec.ts` is also currently failing — confirmed by running it.** Its `TestBed.configureTestingModule` only provides `provideNoopAnimations()`; it does not provide a `Firestore` instance (e.g. via a fake/mock or `provideFirestore`). Since `GdprComponent`'s constructor unconditionally injects `Firestore` and immediately calls `onSnapshot`/`doc` on it, instantiating the component in a test throws:
    ```
    NullInjectorError: R3InjectorError(Standalone[GdprComponent])[Firestore -> Firestore -> Firestore]: No provider for Firestore!
    ```
    File: `src/app/compliance/gdpr/gdpr.component.spec.ts:11-16`. Any rewrite (or a follow-up test fix) needs to mock/provide `Firestore` (or better, extract the Firestore access behind an injectable service so it can be mocked more cleanly — this component doing Firestore I/O directly in its constructor is itself worth reconsidering during the rewrite, both for testability and to match whatever data-loading pattern the rest of the rewritten app uses).
- **Redundant double-negation in the collapse toggle logic.** `(nzActiveChange)="toggle(!$event, child)"` combined with `toggle($event, child) { child.isCollapsed = $event; }` (`gdpr.component.html:13`, `gdpr.component.ts:63-65`) is functionally correct but harder to read than necessary; a straight `child.isCollapsed = !isNowActive` in one place would be clearer.
- **`gdpr.component.scss` is a 0-byte empty file.** No component-specific styling exists for this feature at all — all visuals come from ng-zorro's default `nz-collapse` styling and ambient/global styles. Nothing to port style-wise beyond "make an accordion-like disclosure list."
- **Route name vs. content mismatch.** The route/URL/nav concept is "Compliance" (generic), but the only content ever rendered under it is GDPR-specific (hard-coded `<h1>GDPR</h1>`). If PDPA or other compliance frameworks are meant to live here too (as the task's framing speculated), there is no code for that today — it would be new functionality in the rewrite, not a port of existing behavior.
- **Page has no discoverable entry point in-app.** It's absent from `initialMenuList` (`app.component.ts:18-50`) and from the footer (`@ui/footer/footer.component.html`). Whether this is intentional (a page linked only from outside the SPA, e.g. an external legal footer or an app-store listing) or an oversight is not determinable from source — flagged in Open Questions.

## Open Questions / Verify Against Live Site

- **Actual content of the `public/gdpr` Firestore document** (the real `definition`, `intro`, and each `details[].children[]` item's `title`/`details`/`notes`/`adhered` values) cannot be read from this repo — Firestore document content lives in the Firebase project's database, not in source control. The human maintainer should pull the live document content (via Firebase console or an authenticated session) to capture the actual legal copy for the rewrite.
- **Firestore security rules for `public/gdpr`**: no `firestore.rules` file exists in this repo, so it's inferred-but-unconfirmed that unauthenticated users can read this document (the collection is literally named `public`, and the component makes no auth check). Verify against the Firebase console's deployed rules directly.
- **Whether `/compliance` is linked from anywhere outside this repo** (e.g. an external marketing site, app store listing, or footer on a different property) that would explain why it's absent from the in-app nav — not visible from source.
- **Exact ng-zorro `nz-collapse`/`nz-collapse-panel` visual rendering** (borders, spacing, animation on expand/collapse, icon direction) is themed by ng-zorro's default styles plus whatever global theme overrides exist elsewhere in the app; since `gdpr.component.scss` is empty, the actual pixel-level look should be confirmed on the live/staging site before deciding on the Tailwind equivalent.
- **Whether any other "compliance" surface exists outside this route** (e.g. a PDPA-specific page under a different path) was checked via repo-wide grep for `compliance`/`gdpr`/`pdpa` and none was found — treat the scope as GDPR-only unless the live site shows otherwise.
