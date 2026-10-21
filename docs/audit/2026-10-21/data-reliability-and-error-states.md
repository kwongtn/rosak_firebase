# Data reliability and error states

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 35 findings, most severe first.

Failed reads render as empty or zero, graphqlResource throws or blanks data, retries are unbounded, vote overlays and tracker state go stale, and guards or auth readiness can hang.

<a id="f026"></a>

#### F026 · Public profile header shows the viewer's own name, photo and email instead of the profile owner

**high** · effort S · code-quality · ux-rest

**Where:** `src/app/features/profile/user-card/user-card.component.ts:54`, `src/app/features/profile/user-card/user-card.component.ts:58`, `src/app/features/profile/profile.page.ts:110`

**Problem.** The identity block of UserCardComponent always reads the signed-in Firebase user, even when isOwnProfile is false. On /profile/<someone-else> a logged-out visitor sees the h1 'Anonymous', and a logged-in visitor sees their own display name, photo, e-mail and phone number presented as if they belonged to the profile being viewed. This is exactly the mislabelling that the ProfilePage doc comment says it wants to avoid. It also leaks the viewer's own e-mail onto a page they may screenshot and share. The public query already returns the owner's nickname.

**Recommendation.** When isOwnProfile() is false, render the identity block from user().nickname (fall back to 'Anonymous spotter') and omit photo, e-mail and phone. Only read auth.user() in the own-profile branch. Add a unit test that renders the card with isOwnProfile=false and a signed-in viewer and asserts the viewer's name and e-mail are absent.

**Verification.** user-card.component.ts template reads auth.user() for photo, h1, email and phone regardless of isOwnProfile, and profile.page.ts renders it with [isOwnProfile]="false" for other users. Wrong identity shown is real; the 'leak' is only the viewer's own data shown back to them, so slightly overstated.

**Second check (high-severity pass).** code review: holds (medium). user-card.component.ts lines 54-65 read only auth.user(): `@if (auth.user()?.photoURL; as photo)`, `{{ auth.user()?.displayName || "Anonymous" }}`, plus email and phoneNumber. Nothing branches on isOwnProfile() there. profile.page.ts renders `<app-profile-user-card [user]="user" [isOwnProfile]="false" />` for other people's profiles. So a logged-out visitor sees a heading of 'Anonymous', and a signed-in visitor sees their own name, photo, verified email and phone presented as the profile owner's. The profile query does return `nickname`, which the card already shows in a separate Nickname card. The 'leak' wording is overstated: the data shown is the viewer's own, so it is only visible to the viewer, not exposed to third parties. This is a clear mislabelling bug rather than a security issue. Severity high would fit only if public profiles are a main feature, so I rate it medium. impact review: holds (high). user-card.component.ts renders the photo, `auth.user()?.displayName || "Anonymous"`, the email and the phone number from the signed-in Firebase user. It never checks isOwnProfile(). profile.page.ts:111 renders the same card with [isOwnProfile]="false" for other people's profiles. Every visit to a public profile therefore shows the wrong identity: 'Anonymous' for logged-out visitors, or the viewer's own name, photo, email and phone for logged-in ones. That is wrong data on a core page and it exposes the viewer's own details in a shareable screenshot. It does not leak anyone else's data, so it is a mislabel plus a self-exposure rather than a breach. The fix is tiny.

**Fix note from the second check.** Smallest fix: wrap the photo, email and phone in `@if (isOwnProfile())`, and make the h1 `{{ isOwnProfile() ? (auth.user()?.displayName || "Anonymous") : (user().nickname || "Anonymous spotter") }}`. Add one spec rendering the card with isOwnProfile=false and a signed-in viewer. When isOwnProfile() is false, show user().nickname (or a fallback such as 'Anonymous spotter') and hide the photo, email and phone block. Read auth.user() only on the own-profile branch. Add one spec.

**Also reported as:** [F014](data-reliability-and-error-states.md#f026) [profile-about-misc] Stop showing the signed-in viewer's own name, photo, email and phone on someone else's public profile (src/app/features/profile/user-card/user-card.component.ts:54-66, src/app/features/profile/user-card/user-card.component.spec.ts:64); [F082](data-reliability-and-error-states.md#f026) [gap-2] On a public profile the header shows the viewer's own name, photo and email instead of the profile owner's (src/app/features/profile/user-card/user-card.component.ts:54, src/app/features/profile/user-card/user-card.component.ts:58)

<details><summary>Evidence</summary>

```text
<img [src]="photo" ...> from `auth.user()?.photoURL` and `<h1 class="text-xl font-semibold">{{ auth.user()?.displayName || "Anonymous" }}</h1>`; the page renders `<app-profile-user-card [user]="user" [isOwnProfile]="false" />` for other people's profiles.
```

</details>

<a id="f033"></a>

#### F033 · Stop graphqlResource.data() and errors() from throwing, and keep the last good data during a failed refresh

**high** · effort M · reliability · gap-3

**Where:** `src/app/core/graphql/graphql-client.ts:103`, `src/app/core/graphql/graphql-client.ts:104`, `src/app/core/graphql/graphql-client.ts:149`, `src/app/features/home/data/home.store.ts:233`, `src/app/features/home/data/home.store.ts:572`

**Problem.** The underlying httpResource throws from value() while the request is in an error state, and it returns undefined while a retry is in flight after an error. graphqlResource exposes data() and errors() as plain computeds over raw.value(), so every consumer that reads data() (about 70 call sites, only a handful guarded by hasError first, for example home.store.ts:572) throws inside a computed on every failed poll. Those exceptions go to the Sentry ErrorHandler as noise. After a minute of failed 30-second polls, the home page replaced a perfectly good network board with an empty one, which tells a rider there is no data instead of showing the last known data with a stale banner. The hasError flag is also written from an effect, so it lags the throw by one render, which is why consumers cannot reliably guard on it.

**Recommendation.** Fix it once in graphqlResource. (1) Make data() and errors() total: read raw.hasValue() first and return undefined otherwise. (2) Retain the last successful payload while the request key is unchanged, so a failed or retrying refresh keeps the old data visible alongside the banner, but still clears it when the variables change (several pages rely on data() going undefined when the request changes). Sketch: const last = signal<{ key: string; value: TData } | undefined>(undefined); an effect or the existing success branch stores { key: JSON.stringify(requestFn()?.variables), value }; then data = computed(() => raw.hasValue() ? raw.value()?.data : (last()?.key === currentKey() ? last().value : undefined)). (3) Derive hasError and hasEverLoaded with computed/linkedSignal rather than writing them from an effect. Add specs to graphql-client.spec.ts for 'poll fails after success: data() does not throw and still returns the previous payload' and 'variables change then failure: data() is undefined'. Then the defensive hasError-before-data() ordering in home.store.ts can be removed.

**Verification.** graphql-client.ts:103-104 are plain computeds over raw.value(), and home.store.ts:572 has a comment saying data() throws in an error state and that the hasError check must come first. Real reliability gap, though the exact 'empties after 60 s' claim I did not re-measure.

**Second check (high-severity pass).** code review: holds (high). I read the installed Angular 22.1.0 sources. In _resource-chunk.mjs the value computed does `if (this.state().status === 'loading' && this.error()) return defaultValue; if (!isResolved(streamValue)) throw new ResourceValueError(this.error());`, and HttpResourceImpl does not wrap it. graphql-client.ts lines 103-104 are plain computeds over raw.value(), so data() and errors() throw once an HTTP request has failed, and return undefined while a retry is loading with the error still set. Reload keeps the previous stream only on success, so a failed refresh drops the last good payload. home.store.ts:233 `lines` reads linesResource.data() with no hasError guard, so it throws on every failed poll, and the board empties during retries. There are 77 non-spec `.data()` call sites. The home.store.ts comment at about line 572 confirms the authors know it throws and guard by ordering. Two details: hasValue() is safe because it uses isError() first, and GraphQL-level `errors` on a 200 response do not throw, only HTTP or transport failures. I did not re-run the browser measurement, but the source fully supports the claimed behaviour. It only occurs when the backend fails, which is exactly when last-known data matters. impact review: partially (high). The code matches the claim. graphql-client.ts:103-104 defines `data = computed(() => raw.value()?.data)` and `errors = computed(() => raw.value()?.errors)` with no hasValue() guard. Angular's httpResource value() throws while the resource is in the error state. The home store comments confirm this ('data() THROWS while the resource is in an error state'), and the author guards only a few call sites with a failure flag first. During any backend outage, the 30-second polls on the Home page throw in computeds, which produces Sentry noise and an emptied board (the measurement showed 'No live line data yet' from 60 seconds). Home is the hot path and an outage is exactly when riders look at it, so high is reasonable. The impact is limited to failure windows, and the claim that 'about 70 call sites' are unguarded was not verified. The proposed fix is overbuilt in part: the key-tracked last-good-value cache and moving hasError into computeds go beyond what is needed.

**Fix note from the second check.** Two small changes in graphqlResource cover most of it. (1) Make the computeds total: `const data = computed(() => raw.hasValue() ? raw.value()?.data : undefined)` and the same for errors; this stops the throws and the Sentry noise. (2) For stale-while-error, keep a last-good value keyed on the request variables (the finding's sketch is sound), but do it as a follow-up since it changes semantics for pages that rely on data() going undefined. The hasError-from-effect cleanup in point (3) is optional polish. Minimal root fix in graphqlResource: `const data = computed(() => raw.hasValue() ? raw.value()?.data : undefined)` and the same for errors. That removes the throws everywhere. Optionally keep the last good payload with a linkedSignal keyed on the request variables so a failed poll keeps the old board and shows the stale banner. Add the two specs named in the finding.

**Also reported as:** [F034](data-reliability-and-error-states.md#f033) [home-data] Make graphqlResource keep the last good data so one failed poll does not blank the board (src/app/core/graphql/graphql-client.ts:103, src/app/core/graphql/graphql-client.ts:104)

<details><summary>Evidence</summary>

```text
const errors = computed(() => raw.value()?.errors);
const data = computed(() => raw.value()?.data);
// built bundle (chunk-DzGSJuSF.js), Angular's resource value():
// if(!l||this.state().status===`loading`&&this.error())return r;if(!qd(l))throw new Aa(this.error());return l.value
Measured with headless Chromium against http://localhost:4321/ after failing every /graphql/ POST with HTTP 500 once the page had loaded: 7 uncaught "Aa: Http failure response ... 500" errors in 84 s; the board still showed data at 54 s and showed "No live line data yet" / "No lines yet." from 60 s.
```

</details>

<a id="f020"></a>

#### F020 · Destroy the L7 scene and Mapbox map when leaving /tracker

**medium** · effort S · reliability · tracker-gallery · second check set severity high → medium

**Where:** `src/app/features/tracker/map/tracker-map.component.ts:252`, `src/app/features/tracker/map/tracker-map.component.ts:67`

**Problem.** The component creates a new `Scene` (Mapbox map, WebGL context, rAF render loop, resize/gesture listeners, the animated rail LineLayer) on every visit, but never disposes it. Each client-side navigation away from /tracker and back leaks one WebGL context and a running animation loop. Browsers cap active contexts at around 16, after which Chrome logs `Too many active WebGL contexts` and silently drops the oldest, which can blank the map for returning users. The stops layers are also never removed from the scene, only their effects are destroyed. `documentElement.overflow` is forced to `auto` rather than restored, which fights `HlmSheet`'s own lock/unlock of the same property.

**Recommendation.** In `ngOnDestroy`, after tearing down controllers, call `this.scene?.destroy()` (L7 disposes the map service and renderer), set `this.scene = undefined`, and remove the rail and stops layers first. Capture the previous `documentElement.style.overflow` in `init()` and restore that value instead of the literal `"auto"`. Use `DestroyRef.onDestroy` inside `init()` if you prefer, and add a spec that asserts `scene.destroy` is called (the existing spec mocks `GeojsonStorageService` only).

**Verification.** ngOnDestroy only tears down controllers and stops effects; no scene.destroy() anywhere, and the scene is created on every init. Literal overflow='auto' restore also confirmed (sheet.ts sets '' for the same property).

**Second check (high-severity pass).** code review: partially (medium). The leak holds. tracker-map.component.ts init() creates new Scene({ map: new Mapbox(...) }) after each render. ngOnDestroy only sets overflow to "auto", calls controller.tearDown() on the rt controllers and calls stopEffect() on the stops layers. A grep for scene shows no scene.destroy() anywhere, and the scene and stops layers are never removed. So each visit leaves a Mapbox map, a WebGL context and L7's render loop alive. The overflow point also holds: the literal "auto" is written instead of restoring the prior value, and the sheet spec shows HlmSheet manages the same property. Two claims are wrong. Chrome drops the oldest context when the cap is hit, which is a leaked one, so the current map would not blank as the finding says. The harm is memory and CPU growth and console warnings after many /tracker round trips. Reaching about 16 round trips in one session is uncommon. impact review: partially (medium). The leak is real: tracker-map.component.ts creates new Scene in init() and ngOnDestroy never calls scene.destroy, so each visit leaves a WebGL context and render loop running. It takes many round trips to hit the roughly 16 context cap, so blank maps are uncommon, but the background animation cost on phones is a real battery and slowness issue. The overflow point is minor, since restoring the original value is a one-line tidy-up. The recommended fix (call scene.destroy, clear the reference, restore overflow) is correct and small. It is consistent with the repo conventions and low risk, provided destroy is called after the controllers and effects are torn down.

**Fix note from the second check.** In ngOnDestroy, after the existing teardown, add this.scene?.destroy(); this.scene = undefined;. Store the previous documentElement.style.overflow in init() and restore it in ngOnDestroy. Skip the explicit removal of the rail and stops layers, because scene.destroy() disposes them. Add a spec that asserts scene.destroy is called. In ngOnDestroy, after the existing teardown loops, call this.scene?.destroy() and set this.scene = undefined. Optionally save the previous overflow value in init() and restore it. Removing layers one by one is unnecessary because destroy disposes them.

<details><summary>Evidence</summary>

```text
ngOnDestroy(): void {
  document.documentElement.style.overflow = "auto";
  for (const controller of this.rtControllers.values()) { controller.tearDown(); }
  for (const entry of this.stopsLayers.values()) { entry.stopEffect(); }
}
// no this.scene?.destroy() anywhere in the file
```

</details>

<a id="f022"></a>

#### F022 · Stop failed third-party scripts (ad blockers) from raising a false 'new version deployed' prompt

**medium** · effort S · reliability · ux-home · second check set severity high → medium

**Where:** `src/app/core/version/new-version.service.ts:94`, `src/app/core/version/new-version.service.ts:111`, `src/app/core/version/new-version.service.ts:136`, `src/app/core/version/chunk-load-error.util.ts:16`, `src/index.html:40`, `.omo/evidence/audit-2026-10-21/routes/home__mobile__light__viewport.png`, `.omo/evidence/audit-2026-10-21/routes/home__desktop__light__viewport.png`

**Problem.** The stale-chunk listener is a capture-phase window error handler that treats any failed script whose URL ends in .js as 'a lazy chunk of ours 404'd after a deploy'. It never checks that the script is same-origin. adsbygoogle.js (and the gtag/analytics scripts Firebase injects later) are blocked by a large share of real visitors' ad blockers, tracking protection and corporate DNS. Each blocked script therefore sets hasNewVersion permanently, shows the toast on top of the header, and turns on the pulsing 'Update available' button in the nav tray. Reloading cannot clear it, so the prompt is a false alarm that trains users to ignore real deploy prompts. The audit treated blocked ads as a setup artefact, but the same blocking happens in production and is the likely reason the banner appears on a plain first load of Home in the screenshots. Offline is a second false trigger: a lazy route chunk failing with no network is reported as a new deployment (see the offline finding).

**Recommendation.** Add the origin guard in onError. The AppErrorHandler path only sees error messages, not script URLs, so the guard is not needed there. Keep the /version.json poll as the source of truth and skip the prompt when navigator.onLine is false.

_Original suggestion (corrected by the verifier):_ In onError, ignore scripts whose origin is not location.origin: `const src = event.target instanceof HTMLScriptElement ? new URL(event.target.src, location.href) : null; if (src && src.origin !== location.origin) return;`. Apply the same origin guard before matching CHUNK_URL_PATTERN in the AppErrorHandler path in app.config.ts. Also skip the prompt when navigator.onLine is false, and clear hasNewVersion on recovery. Prefer relying on the /version.json poll (already implemented) as the only 'new version' truth and use the chunk-failure signal only to trigger an immediate version.json check rather than to raise the toast directly. Add a unit test: a blocked cross-origin adsbygoogle.js error must not call promptReloadForNewVersion.

**Verification.** onError in new-version.service.ts is a capture listener with no origin check, and CHUNK_URL_PATTERN matches the adsbygoogle.js?client=... URL from index.html. The toast is visible in the home mobile screenshot, and an ad-blocker failure would fire the same script error event for real users.

**Second check (high-severity pass).** code review: partially (medium). The core defect is real. onError in new-version.service.ts:97 uses event.target.src with no origin check, and CHUNK_URL_PATTERN matches 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=...' (I ran the regex under node and it returned true). A failed script then calls promptReloadForNewVersion(), which sets hasNewVersion and shows the toast. The screenshot shows exactly that toast on a plain Home load. Three parts of the finding do not hold. First, the claim that gtag/analytics scripts trigger it is wrong: 'https://www.googletagmanager.com/gtag/js?id=G-XXX' does not match the pattern (the last path segment 'js' has no '.js' suffix), and the code only creates its own script tag for reCAPTCHA. A blocked reCAPTCHA 'api.js?render=KEY' would match, but that is rare and only occurs on submit. Second, adsbygoogle.js is a static async tag in index.html that starts at parse time, while the capture listener is only registered inside an app initializer after the main bundle has downloaded and bootstrapped. Extension and DNS blocks fail within milliseconds, so their error event probably fires before the listener exists. That makes the false alarm much less certain for typical ad-blocker users than claimed. It is most likely for slow failures (firewall drops, offline, the sandbox in the screenshots). Third, offline is a separate trigger from ad blockers. So this is a genuine but timing-dependent false positive, not a guaranteed effect on 'a large share of visitors'. impact review: holds (high). The capture-phase error listener in new-version.service.ts calls isChunkLoadError on event.target.src for any failed script. CHUNK_URL_PATTERN matches any URL ending in .js, with no same-origin check. index.html loads https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js, which many ad blockers and DNS filters block. So a blocked ad script sets hasNewVersion, shows the 'Update available' toast and lights the nav button, and a reload cannot clear it. This affects a large share of mobile and desktop visitors on first load, and it undermines the real deploy prompt. One caveat: the listener is registered when Angular boots, so a block that fails before bootstrap would not be seen, but the screenshots show the toast does appear.

**Fix note from the second check.** Add the origin guard in onError, which is the only place scripts are inspected: skip the prompt when the script's src does not start with location.origin, i.e. `const src = event.target instanceof HTMLScriptElement ? new URL(event.target.src, location.href) : null; if (src && src.origin !== location.origin) return;`. The AppErrorHandler path only sees messages, so it needs no change. Add one spec for a cross-origin failing script. Skip the larger redesign (clearing hasNewVersion on recovery, onLine checks) unless offline false alarms are separately confirmed. Smaller fix: in onError, return early when the script's origin differs from location.origin: `const u = new URL(event.target.src, location.href); if (u.origin !== location.origin) return;`. Add one spec for a blocked cross-origin script. The extra work in the recommendation (clearing the flag on recovery, treating the version.json poll as the only source of truth) is optional.

**Also reported as:** [F070](data-reliability-and-error-states.md#f022) [core-shell] NewVersionService can show a false 'update available' for any third-party script that fails, and adds noise (src/app/core/version/new-version.service.ts:97, src/app/core/version/new-version.service.ts:66)

<details><summary>Evidence</summary>

```text
const scriptSrc = event.target instanceof HTMLScriptElement ? event.target.src : "";
...
window.addEventListener("error", onError, true);   // capture: sees EVERY failed <script>
const CHUNK_URL_PATTERN = /\/[^\s/'"]+\.js(?:\?[^\s]*)?(?:#[^\s]*)?$/i;
// index.html: src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-..."
Screenshots: the toast 'Update available - A new version was deployed and part of this page couldn't load' is on screen on a first load of Home, covering the logo and nav.
```

</details>

<a id="f060"></a>

#### F060 · Show an error state instead of an empty-queue message when a console queue fails to load

**medium** · effort S · ux · console

**Where:** `src/app/features/console/insiden/pending/pending.component.ts:828`, `src/app/features/console/insiden/pending/pending.component.html:68`, `src/app/features/console/insiden/links/links.component.ts:1701`, `src/app/features/console/insiden/links/links.component.html:166`, `src/app/features/console/console.page.ts:289`

**Problem.** All three console queues report a failed fetch only through a transient toast and leave the row signal empty. The table then renders the normal empty state, so a moderator who misses the toast (expired token, backend restart, cold start) is told 'No incidents waiting for approval', which is the success state of the queue. The console.page spotting table just shows headers with no rows. Nothing distinguishes 'nothing to do' from 'could not check'.

**Recommendation.** Add a `loadError = signal<string | null>(null)` per page, set it in the catch and clear it on success. In the template branch `@if (loadError()) { <app-error-box [showRetry]="true" (retry)="load()" .../> } @else if empty ...`. ErrorBoxComponent is already imported by both pending and links pages. Keep the previously loaded rows on screen on a refresh failure instead of clearing them, and show a 'Showing data from HH:mm' cue.

**Verification.** pending.load, links.fetchLinks and console.page.load only toast in catch and leave the rows signal untouched. pending.component.html shows 'No incidents waiting for approval.' on empty with no error branch, and spotting has no @empty at all.

**Also reported as:** [F175](data-reliability-and-error-states.md#f060) [ux-rest] Console treats a failed load as an empty queue, and the spotting list has no empty state (src/app/features/console/insiden/pending/pending.component.html:71, src/app/features/console/insiden/pending/pending.component.ts:144)

<details><summary>Evidence</summary>

```text
pending.component.ts: } catch (err) { this.toast.error("Couldn't load the approval queue", ...) }  // rows stays []
pending.component.html:71: No incidents waiting for approval.
links.component.html:169: No social media links match the current filters.
```

</details>

<a id="f061"></a>

#### F061 · Pending-incident search silently drops a debounced query while another request is in flight

**medium** · effort S · reliability · console

**Where:** `src/app/features/console/insiden/pending/pending.component.ts:815`, `src/app/features/console/insiden/pending/pending.component.ts:322`, `src/app/features/console/insiden/links/links.component.ts:1622`

**Problem.** The 300 ms debounce fires after the user pauses, but if the previous request (or the first page-load request, which first awaits the Firebase ID token) is still running, load() returns immediately. appliedSearch has already been updated, so the input shows the new term while the table keeps the results of the old term, with no retry and no indication. On a cold Cloud Run backend this is easy to hit. The links page has the same hazard but already solved it with `reloadQueued` and `finishLoading()`; the pending page copied the guard without the queue. The pending spec has no test for typing during a load.

**Recommendation.** Port the reloadQueued replay from links; a full resource() rewrite is optional.

_Original suggestion (corrected by the verifier):_ Either port the queue-and-replay logic (`if (isLoading) { reloadQueued = true; return; }` plus a drain in `finally`), or better, replace the hand-written loader with `resource({ params: () => this.appliedSearch(), loader })` where the applied term is a signal. `resource` supersedes stale loads automatically, so no flag is needed. Add a spec that types twice while the first GraphQL promise is unresolved.

**Verification.** pending.load() returns silently on isLoading (no reloadQueued) while onSearchInput has already set appliedSearch; links.load() parks the reload. The first load awaits idToken, so the window is real.

<details><summary>Evidence</summary>

```text
private async load(): Promise<void> {
  if (this.isLoading()) {
    return;
  }
// onSearchInput: this.searchDebouncer.push(() => { this.appliedSearch = ...; this.load(); });
```

</details>

<a id="f064"></a>

#### F064 · Make hasError server-correct so a failed SSR query does not render the 'empty' branch and mismatch hydration

**medium** · effort S · ssr-hydration · core-shell · partially confirmed

**Where:** `src/app/core/graphql/graphql-client.ts:145`, `src/app/core/graphql/graphql-client.ts:148`, `src/app/core/graphql/graphql-client.ts:182`

**Problem.** hasError is only ever set by a browser-only effect, so on the server it stays false even when the SSR request failed. After a backend blip during SSR, a page written as '@if (isLoading) skeleton @else if (hasError) retry-banner @else content' renders the settled-with-no-data branch into the HTML. The client then starts with raw.isLoading() true (failed responses are not in the transfer cache), so it renders the skeleton and the DOM structure differs from the server markup, which risks NG0500 hydration errors and a flash of an empty page that crawlers may index.

**Recommendation.** Derive a platform-aware flag as suggested, but verify against one real page in an SSR run and drop the NG0500 and crawler claims unless reproduced.

_Original suggestion (corrected by the verifier):_ Derive the public flag from state both platforms can compute, for example: const hasErrorPublic = computed(() => isBrowser ? hasError() : rawHasError()). On the server this makes the retry banner (or error box) the rendered state, matching what the client shows until the first retry succeeds. Add a server spec using provideServerRendering-style PLATFORM_ID to pin this.

**Verification.** hasError is only set inside the isBrowser effect, so it stays false on the server after a failed request. A mismatch with the client's initial loading state is plausible, but I did not reproduce an NG0500 and some pages may gate on isLoading differently.

<details><summary>Evidence</summary>

```text
if (isBrowser) {
  effect(() => { ... hasError.set(true); ... });
}
...
isLoading: computed(() => raw.isLoading() && !hasEverLoaded() && !hasError()),
hasError: hasError.asReadonly(),
```

</details>

<a id="f071"></a>

#### F071 · is404Error swallows every error that mentions 404, including real API endpoint failures

**medium** · effort S · reliability · core-shell

**Where:** `src/app/app.config.ts:35`, `src/app/app.config.ts:39`, `src/app/app.config.ts:51`, `src/app/app.config.ts:77`

**Problem.** The goal is to keep route-level 404s (NotFound) out of logs, but the predicate drops any error whose status is 404 or whose message merely contains the word 404, regardless of source. A mistyped or removed backend endpoint (the GraphQL URL, upload/, version/) returning 404, or an error message such as 'Failed to load /media/404.jpg', never reaches Sentry or the console, and the repo's own rule is to never swallow errors. The user sees a stuck spinner and the team sees nothing.

**Recommendation.** Narrow it to the cases that are expected: only HttpErrorResponse 404s whose url is on the app's own origin and matches the page routes (not environment.backendUrl or backendGraphqlUrl), and remove the free-text /\b404\b/ message and string checks. Keep a Sentry breadcrumb or low-level captureMessage for the ignored cases so the volume is still visible. Add specs for the backend-404 case.

**Verification.** is404Error drops any HttpErrorResponse 404 and any message or string containing '404', with no source filter, so backend endpoint 404s never reach Sentry.

<details><summary>Evidence</summary>

```text
if (error instanceof HttpErrorResponse && error.status === 404) { return true; }
...
if (typeof candidate.message === "string" && /\b404\b/i.test(candidate.message)) { return true; }
...
handleError(error: unknown): void { if (is404Error(error)) { return; } ...
```

</details>

<a id="f079"></a>

#### F079 · AuthService.whenReady never resolves if reading the token claims throws, which hangs guards and the profile page

**medium** · effort S · reliability · gap-2 · partially confirmed · severity adjusted from high

**Where:** `src/app/core/auth/auth.service.ts:80`, `src/app/core/auth/auth.service.ts:85`, `src/app/core/auth/admin-only.guard.ts:12`, `src/app/core/auth/redirect-to-own-profile.guard.ts:13`, `src/app/features/profile/profile.page.ts:175`

**Problem.** getIdTokenResult() refreshes the token over the network when it has expired (Firebase ID tokens last one hour, so most returning visitors hit this). If the device is offline or the refresh fails, the promise rejects inside the async observer, resolveReady() is never called, and the error is only an unhandled rejection. Every consumer that awaits whenReady then waits forever: /profile and /console navigation never complete, the profile page stays on its skeleton, the vote overlay never loads. Even on the happy path, readiness is blocked behind a network round trip, and a localStorage read that throws (blocked storage) has the same effect. isAdmin also keeps the previous value during an account switch until the await settles.

**Recommendation.** Wrap the observer body in try/catch/finally: set user and isLoggedIn first, compute claims in a try (on failure set isAdmin to false and report to Sentry), wrap the localStorage read in try/catch, and call resolveReady() in finally. Prefer onIdTokenChanged so claim changes after a forced refresh are picked up, and consider resolving ready as soon as the user is known and updating isAdmin afterwards if guards can tolerate it. Add auth.service.spec.ts covering the rejection path.

**Verification.** auth.service.ts awaits user.getIdTokenResult() in the observer before resolveReady() with no try/catch, so a rejection leaves whenReady unresolved and the guards hang. That is real. It only happens when the refresh fails (offline with an expired token), so 'most returning visitors hit this' and 'high' are overstated.

**Also reported as:** [F311](data-reliability-and-error-states.md#f079) [core-shell] AuthService.whenReady can never resolve, hanging the admin and profile guards (src/app/core/auth/auth.service.ts:80, src/app/core/auth/auth.service.ts:85)

<details><summary>Evidence</summary>

```text
async (user) => {
  this.userSignal.set(user);
  this.isLoggedIn.set(user !== null);
  this.isAdmin.set(user !== null && (await user.getIdTokenResult()).claims["admin"] === true);
  this.firstName.set(user ? localStorage.getItem(firstNameStorageKey(user.uid)) : null);
  this.resolveReady();
},
```

</details>

<a id="f101"></a>

#### F101 · A failed feed or Last Week read leaves a blank panel, and the only error message is a banner at the very top of the page

**medium** · effort S · ux · home-ui

**Where:** `src/app/features/home/home.page.ts:143`, `src/app/features/home/home.page.ts:299`, `src/app/features/home/home.page.ts:360`, `src/app/features/home/home.page.ts:556`

**Problem.** When the feed or the Last Week resource errors, the skeleton is gone and the empty state is suppressed, so the feed panel renders nothing at all and the Last Week tab reads 'Last Week (–)' over an empty box. The retry banner is the only explanation and sits above the hero, roughly 1,100 px above the feed on a phone, where a reader scrolled to the feed will not see it. hasError() is also a single OR across all three reads, so one failing read blames 'the front page' without saying which part is stale. Offline readers see the same.

**Recommendation.** Render a small inline error card in each panel when its own resource failed: `@else if (store.feedFailed()) { <p role="alert">Couldn't load today's links. <button (click)="store.reloadAll()">Try again</button></p> }`, with feedFailed and lastWeekFailed exposed from the store (they already have hasError per resource). Keep the page banner for the lines read. Also consider an 'Updated 14:32' or 'Offline, showing data from 14:32' freshness cue next to the countdown.

**Verification.** Feed empty-state is guarded by !store.hasError() and the skeleton is gone on error, leaving the panel blank; the only error surface is the retry banner at the top of the page (home.page ~143). hasError is a combined OR.

<details><summary>Evidence</summary>

```text
home.page.ts:299  } @else if (store.feedLinks().length === 0 && !store.hasError()) { ...feed-empty... }
home.page.ts:363  !store.hasError()   (same guard on the Last Week empty state)
home.page.ts:144  <app-retry-banner [resource]="errorResource" message="Couldn't load the front page." />
```

</details>

<a id="f112"></a>

#### F112 · Changing month shows a false 'No incidents on this day' and an empty calendar for 2-3 seconds

**medium** · effort S · ux · insiden-ui

**Where:** `src/app/features/insiden/insiden.page.ts:92-100`, `src/app/features/insiden/insiden.page.ts:121-126`, `src/app/features/insiden/insiden.page.html:49-50`, `src/app/features/insiden/insiden.page.html:129-131`, `src/app/core/graphql/graphql-client.ts:160`

**Problem.** The page's skeleton only shows for the very first fetch, because isLoading deliberately stays false afterwards. When the URL date moves to another month the query variables change, the resource drops to its loading state and data() becomes undefined, so allIncidents() is an empty array. The page then tells the rider 'No incidents on this day.', removes the Ongoing section and shows a calendar with no severity dots, with no spinner or busy state, until the response lands. On a service-disruption board, a wrong 'nothing happened' message is worse than a spinner, and the response takes several seconds with the current over-fetching query.

**Recommendation.** Gate the incident lists on `incidentsResource.isFetching()` as well. While it is true, either keep the previous month's data (hold it in a `linkedSignal` that only replaces its value when new data arrives) and set `aria-busy="true"` on the list, or render the skeleton for the day list while keeping the calendar mounted. Suppress the empty-state paragraph unless `!isFetching()`. Also announce the load through a polite live region such as 'Loading April 2023'.

**Verification.** graphqlResource isLoading is first-fetch-only (graphql-client.ts:182) while isFetching exists. insiden.page.html:129 shows 'No incidents on this day.' whenever the lists are empty, and the page never reads isFetching. Month change therefore flashes the false empty state.

**Also reported as:** [F164](data-reliability-and-error-states.md#f112) [ux-insiden-gallery] Show a loading/fetching state when switching month instead of an empty calendar and "No incidents on this day" (src/app/features/insiden/insiden.page.ts:96, src/app/features/insiden/insiden.page.ts:152)

<details><summary>Evidence</summary>

```text
isLoading: computed(() => raw.isLoading() && !hasEverLoaded() && !hasError()) in graphqlResource, while the page reads `this.incidentsResource.data()?.calendarIncidents ?? []` and renders `<p ...>No incidents on this day.</p>` when both lists are empty. Measured with headless Chrome against localhost:4321 after clicking 'Next month' on /insiden/2023-03-15: at 1 s and 2 s `noIncidentsText=true, dots=0`; at 3 s the real data arrived (19 dots, text gone).
```

</details>

<a id="f113"></a>

#### F113 · An invalid or impossible :date URL breaks SSR output and triggers an endless GraphQL retry loop

**medium** · effort S · reliability · insiden-ui

**Where:** `src/app/features/insiden/insiden.page.ts:59`, `src/app/features/insiden/insiden.page.ts:87-90`, `src/app/features/insiden/data/calendar-date.util.ts:3-18`, `src/app/core/routing/optional-param-matcher.ts:14-26`

**Problem.** dateParam is used as-is. For 'foo', `new Date('foo-01T00:00:00Z')` is an Invalid Date, calendarMonthRange sends 'NaN-NaN-NaN' as the range, the backend rejects it, and graphqlResource then retries with exponential backoff up to 3 minutes for an error that can never succeed. The calendar and the `date` pipe also receive Invalid Date values, which breaks the server render partway through. Crawlers or users following a mistyped or stale link therefore get a half-rendered page and a permanent error banner, and an impossible date such as 2026-02-31 passes through V8's lenient parsing to a different day than the URL names.

**Recommendation.** Normalise the param in one computed: accept only `/^\d{4}-\d{2}-\d{2}$/`, verify the round trip (`dateKeyOf(new Date(key + 'T00:00:00Z')) === key`), and otherwise fall back to today (or redirect to /insiden with `router.navigateByUrl(..., { replaceUrl: true })` or return a 404 through the same RESPONSE_INIT mechanism NotFoundPage uses). Feed only the validated key into calendarMonthRange and the date pipe. A matcher with a `\d{4}-\d{2}-\d{2}` check in pathWithOptionalParamMatcher's insiden use would also work and lets unmatched paths hit the wildcard 404.

**Verification.** The matcher accepts any single segment and selectedDate uses dateParam as-is (insiden.page.ts:87). `new Date('foo-01T00:00:00Z')` is invalid, so NaN range goes to the backend. graphqlResource retries on error.

**Also reported as:** [F091](data-reliability-and-error-states.md#f113) [gap-4] Validate the /insiden/:date parameter: malformed dates break the page and impossible dates are silently rolled over (src/app/features/insiden/insiden.page.ts:59, src/app/features/insiden/insiden.page.ts:87-88)

<details><summary>Evidence</summary>

```text
protected readonly selectedDate = computed(() => this.dateParam() ?? dateKeyOf(new Date())); the matcher accepts any single segment. Measured: curl localhost:4321/insiden/foo returns 200 but the HTML body stops after the 'Today ‹ ›' buttons (no weekday labels, no day cells, no list); in the browser the page shows 'Couldn't load incidents. Retrying in 3s...' indefinitely. /insiden/2026-02-31 silently renders March 3 data under a URL that says February 31.
```

</details>

<a id="f126"></a>

#### F126 · Report bootstrap failures to Sentry instead of only console.error

**medium** · effort S · reliability · platform

**Where:** `src/main.ts:50`, `src/main.ts:52`

**Problem.** The rejection from bootstrapApplication is consumed here, so it never reaches the window unhandledrejection handler that Sentry listens to, and Angular's ErrorHandler is not running yet. A broken deploy, an incompatible hydration state or a throwing app initializer therefore leaves visitors with a dead page and produces no Sentry event at all. This also contradicts the repo rule not to swallow errors and let Sentry catch them.

**Recommendation.** Change the catch to `.catch((err) => { Sentry.captureException(err); console.error(err); });`. Keep the replay addIntegration in a separate then so a failure to load the replay bundle cannot be confused with a bootstrap failure.

**Verification.** main.ts has .catch((err) => console.error(err)) on bootstrapApplication, so a bootstrap failure never reaches Sentry. The one-line fix is correct.

<details><summary>Evidence</summary>

```text
bootstrapApplication(App, appConfig)
  .then(() => Sentry.addIntegration(Sentry.replayIntegration()))
  .catch((err) => console.error(err));
```

</details>

<a id="f127"></a>

#### F127 · Remove a spotting from the list (and update counts) after a successful delete

**medium** · effort S · ux · profile-about-misc · severity adjusted from high

**Where:** `src/app/features/profile/my-spottings/my-spottings.component.ts:339-367`, `src/app/features/profile/my-spottings/my-spottings.component.ts:154-165`

**Problem.** After the mutation succeeds the component only shows a toast. _ownEvents is never filtered, so the deleted row stays on screen with its Delete button re-enabled (the finally block clears _deletingId). The user sees a success message and an unchanged list, and can press Delete again and hit a server error. The parent's spottingsCount, the stat card and the heatmap also stay stale until a reload. The toast also exposes an internal database id ('#1234'), which means nothing to the rider.

**Recommendation.** On ok, call this._ownEvents.update(list => list.filter(e => e.id !== eventId)) and emit an output (for example deleted = output<void>()) so ProfilePage can decrement user.spottingsCount or reload. Change the toast to 'Spotting deleted'. Because the list is offset-paginated, also decrement the offset assumption (it already uses _ownEvents().length, so filtering keeps the next page consistent). Add a spec for the delete path.

**Verification.** deleteEvent on ok only toasts with the '#id' text. _ownEvents is never filtered and finally clears _deletingId, so the row stays with Delete re-enabled. The parent counts also stay stale.

**Also reported as:** [F083](data-reliability-and-error-states.md#f127) [gap-2] Deleting a spotting shows a success toast but leaves the row on screen; the component has no spec (src/app/features/profile/my-spottings/my-spottings.component.ts:357, src/app/features/profile/my-spottings/my-spottings.component.ts:321)

<details><summary>Evidence</summary>

```text
if (data.deleteEvent.ok) {
  this.toast.success(`Deletion of spotting entry #${eventId} successful.`);
} else {
  this.toast.error("Unknown error on deletion", "Please refresh the page and try again.");
}
```

</details>

<a id="f128"></a>

#### F128 · A failed first load of 'Historical Spottings' reads 'No spottings logged yet' and offers no retry

**medium** · effort S · ux · profile-about-misc

**Where:** `src/app/features/profile/my-spottings/my-spottings.component.ts:96-101`, `src/app/features/profile/my-spottings/my-spottings.component.ts:311-318`

**Problem.** If the first GET_MY_EVENTS request fails (offline, token race, 5xx), the only signal is a transient toast; the card then permanently shows 'No spottings logged yet.', which tells an active spotter their history is gone. There is no retry button. The sibling My Links card already solves this with _loadError and a Retry button, so the two cards on one page behave differently.

**Recommendation.** Add a _loadError signal, set it in the catch, and render 'Couldn't load your spottings' with a Retry button (calling loadMore) before the empty-state branch, as my-links.component.ts:112-125 does. Only show the empty message when the request succeeded with zero rows.

**Verification.** The loadMore catch only toasts, and the template shows 'No spottings logged yet.' when _events() is empty and not loading. There is no error signal or retry, unlike my-links.

<details><summary>Evidence</summary>

```text
} @else if (_events().length === 0) {
  <p class="text-muted-foreground text-sm">No spottings logged yet.</p>
...
} catch (err) {
  this.toast.error("Couldn't load spottings", err instanceof Error ? err.message : "Unknown error");
```

</details>

<a id="f139"></a>

#### F139 · Fetch errors are shown as empty states in history, incidents and the vehicle heatmap

**medium** · effort S · reliability · spotting

**Where:** `src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:40`, `src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:136`, `src/app/features/spotting/vehicle-detail/incident-timeline/incident-timeline.component.ts:45`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:200`

**Problem.** When the history request fails, the list says 'No spottings logged yet.' (and loadMore has try/finally with no catch, so a network error also becomes an unhandled rejection from the effect). When the incident query fails, graphqlResource's hasError is never read, so the card says 'No record'. A failed heatmap request draws an empty grid with 'No spottings recorded yet'. People will conclude a well-spotted vehicle has no history. The history also shares one _isLoading and _hasMore across vehicles, so a slow response for the previous vehicle can flip 'Load more' for the new one.

**Recommendation.** Use the existing `app-retry-banner` for the incident and heatmap resources (`@else if (resource.hasError())`). In SpottingHistoryComponent track `_error` per load, show a retry button instead of the empty text, and ignore results whose vehicleId no longer equals `this.vehicleId()`. Consider rewriting history with `graphqlResource` keyed by an `offset` signal so it gets backoff and SSR for free.

**Verification.** spotting-history shows 'No spottings logged yet.' when events are empty regardless of error, loadMore has try/finally with no catch, and _isLoading/_hasMore are shared across vehicles. incident-timeline never reads hasError(), and the heatmap caption shows the empty text.

**Also reported as:** [F179](data-reliability-and-error-states.md#f139) [ux-spotting] Vehicle heatmap and incident card show 'zero' while loading or after a failed fetch (src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:200, src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:208)

<details><summary>Evidence</summary>

```text
} @else if (_events().length === 0) { <p class="text-muted-foreground text-sm">No spottings logged yet.</p>
...
} @else { <p class="text-muted-foreground text-sm">No record</p> }   // incident timeline: only isLoading() and a list check
...
private readonly spottingHistoryResource = graphqlResource<...>   // no hasError handling; caption becomes 'No spottings recorded yet'
```

</details>

<a id="f148"></a>

#### F148 · Make RtSource.pause() final: abort in-flight fetches, guard against overlap, and add a timeout

**medium** · effort S · reliability · tracker-gallery

**Where:** `src/app/features/tracker/data/gtfs-realtime.service.ts:78`, `src/app/features/tracker/data/gtfs-realtime.service.ts:112`, `src/app/features/tracker/data/gtfs-realtime.service.ts:115`, `src/app/features/tracker/data/gtfs-realtime.service.ts:173`

**Problem.** `pause()` only clears timers. A fetch already in flight (typical, since each poll takes about 0.7 s) still resolves and calls `scheduleNext`, which arms a fresh `pollTimeout`. So after leaving /tracker, or after unchecking a source and pressing Apply (`upsertSources` calls `source.pause()` and then drops the reference), the feed keeps polling in the background forever with no tick interval and no owner. `resume()` and `retryNow()` call `refresh()` without checking `isLoading`, so two requests can overlap and land out of order. `fetch` has no timeout or AbortSignal, so a hung connection leaves `isLoading` true and the source never reschedules.

**Recommendation.** Keep a private `paused` flag and an `AbortController`. `pause()` sets `paused = true` and aborts; `refresh()` returns immediately if `paused` or if a request is already running, creates `new AbortController()`, passes `signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)])` to `fetch`, and only calls `scheduleNext` when `!paused`. `resume()` sets `paused = false`. Add a spec with fake timers covering pause-during-fetch, backoff growth to the 5 minute cap, and overlapping retryNow.

**Verification.** pause() only clears timers; an in-flight refresh() still reaches scheduleNext and re-arms pollTimeout, and fetch has no signal/timeout. resume()/retryNow() call refresh without an in-flight guard.

**Also reported as:** [F143](data-reliability-and-error-states.md#f148) [test-gaps] Polling timers re-arm after pause or removal when a fetch is still in flight (src/app/features/tracker/data/gtfs-realtime.service.ts:78-80, src/app/features/tracker/data/gtfs-realtime.service.ts:115-132)

<details><summary>Evidence</summary>

```text
pause(): void { clearTimeout(this.pollTimeout); clearInterval(this.tickInterval); }
...
private async refresh(): Promise<void> {
  this.isLoading.set(true);
  try { const res = await fetch(this.sourceUrl);
  ...
  this.scheduleNext(this.refreshIntervalMs ?? Infinity);
```

</details>

<a id="f173"></a>

#### F173 · Firestore offline or cache-miss shows 'No GDPR information has been published yet' instead of an error or loading state

**medium** · effort S · reliability · ux-rest

**Where:** `src/app/features/gdpr/gdpr.page.ts:56`, `src/app/features/about/about.page.ts:168`, `src/app/features/gdpr/gdpr.page.html:53`, `.omo/evidence/audit-2026-10-21/routes/gdpr__desktop__light__viewport.png`

**Problem.** With no connection and no cached document, Firestore's onSnapshot fires once with an empty, fromCache snapshot, and the page treats that as 'document does not exist'. A visitor on a flaky mobile connection is therefore told that the project has published no GDPR information, which is a false compliance statement. The 2026-08-24 fix only handled the error callback. /about has the same pattern (shows 'Nothing has been published on this page yet').

**Recommendation.** In the next callback, ignore the snapshot while `snap.metadata.fromCache && !snap.exists()` (keep isLoading true) and start a timeout of about 8 s that flips isError so the Retry banner appears. Consider a shared helper `watchPublicDoc<T>(id)` used by both pages, plus a unit test with a fake snapshot.

**Verification.** gdpr.page.ts and about.page.ts next callbacks set data from snap.data() and clear loading with no fromCache check; Firestore emits an empty cache snapshot when offline with no cached doc, so the 'nothing published' message appears. The error callback only covers hard errors.

<details><summary>Evidence</summary>

```text
`(snap) => { this._data.set(snap.data() as PublicGdprDocument | undefined); this.isLoading.set(false); }` with no check of `snap.metadata.fromCache`. The desktop screenshot (Firestore failed with ERR_ADDRESS_UNREACHABLE) shows the h1 and 'No GDPR information has been published yet.'
```

</details>

<a id="f189"></a>

#### F189 · A rejected mutation shows two error toasts, reports expected conflicts to Sentry, and leaves the stale row in place

**medium** · effort M · data-fetching · console

**Where:** `src/app/core/graphql/graphql-client.ts:229`, `src/app/core/graphql/graphql-client.ts:230`, `src/app/features/console/insiden/pending/pending.component.ts:808`, `src/app/features/console/insiden/links/links.component.ts:1160`

**Problem.** GraphQLClient.request already toasts 'GraphQL Error' and sends the exception to Sentry for any GraphQL error, then every console catch block toasts a second time with the same message ('Action failed', "Couldn't approve link", and so on). A moderator sees two stacked toasts for one rejection, and routine business rejections such as an incident another admin already approved are logged as Sentry exceptions. The message shown is the raw server string with no mapping, and after a failure the queue is not refetched, so a row already handled by another moderator stays on screen with buttons that will keep failing.

**Recommendation.** Add an options argument, for example `request(query, vars, headers, { silent: true })`, that skips the built-in toast and Sentry capture, and let the console pages be the only reporter. Give GraphQLRequestError a `code` from `errors[].extensions` so callers can map 'already approved/not found' to friendly copy and call `load()` to resync. Keep Sentry capture for unexpected errors only.

**Verification.** graphql-client.ts toasts 'GraphQL Error' and calls Sentry.captureException on any GraphQL errors response before throwing. Each console catch toasts again, so the user sees two toasts.

<details><summary>Evidence</summary>

```text
graphql-client.ts:229-230: this.toast.error("GraphQL Error", error.message); Sentry.captureException(error);
pending.component.ts:808: this.toast.error("Action failed", err instanceof Error ? err.message : "Unknown error");
```

</details>

<a id="f190"></a>

#### F190 · Stop retrying non-transient GraphQL and HTTP errors forever, and make retries online- and visibility-aware

**medium** · effort M · data-fetching · core-shell

**Where:** `src/app/core/graphql/graphql-client.ts:105`, `src/app/core/graphql/graphql-client.ts:125`, `src/app/core/graphql/graphql-client.ts:149`, `src/app/core/graphql/graphql-client.spec.ts:135`

**Problem.** Every failure is treated as transient. A GraphQL validation error (for example a renamed field after a backend deploy), a 400/401/403/404, or an auth rejection is retried indefinitely every up to 3 minutes, and the UI keeps saying 'Retrying in Ns' for something that can never succeed. There is no jitter, so many tabs recover in lockstep. The timer ignores document visibility (a backgrounded or keep-alive-detached page keeps reloading) and ignores the browser's online/offline state (no 'online' listener to retry the moment connectivity returns, and no offline indicator exists anywhere in the app). The attempt counter is incremented before the delay is computed, so the first retry actually waits 10 s, not the 5 s the doc comment promises (delays are 10, 20, 40, 80, 160, 180 s). The spec asserts only that a countdown exists, not the schedule or the non-transient case.

**Recommendation.** Classify the failure before scheduling: schedule retries only for status 0/network errors, 408, 429 and 5xx (read raw.error() as HttpErrorResponse) and treat GraphQL 'errors' as terminal unless the extensions code says otherwise. Add +/-20% jitter, pause the timer while document.hidden, and call retryNow() from a window 'online' listener. Compute the delay from attempt() before incrementing (or fix the doc), and add spec cases for 400 vs 503 and for the delay sequence. Expose a terminal 'hasPermanentError' so RetryBanner can show 'Something is wrong on our side' without a countdown.

**Verification.** graphql-client.ts retries every error class with no jitter, visibility or online check. attempt increments before 5000*2**attempt, so the first wait is 10s as claimed. The spec only asserts the countdown is non-null.

**Also reported as:** [F087](data-reliability-and-error-states.md#f190) [gap-3] GraphQL errors on reads are invisible to Sentry and retried forever; add a retry cap, jitter and error reporting (src/app/core/graphql/graphql-client.ts:35, src/app/core/graphql/graphql-client.ts:106)

<details><summary>Evidence</summary>

```text
const hasGraphQLErrors = computed(() => (errors()?.length ?? 0) > 0);
const rawHasError = computed(() => raw.error() !== undefined || hasGraphQLErrors());
...
if (nowHasError) { hasError.set(true); attempt.update((n) => n + 1); scheduleRetry(); return; }
...
const delayMs = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt(), RETRY_MAX_DELAY_MS);
```

</details>

<a id="f192"></a>

#### F192 · Fix GraphQLClient.request double toasts, raw error copy, missing timeout and untyped errors

**medium** · effort M · ux · core-shell · partially confirmed

**Where:** `src/app/core/graphql/graphql-client.ts:212`, `src/app/core/graphql/graphql-client.ts:229`, `src/app/core/graphql/graphql-client.ts:239`, `src/app/shell/account-panel/account-panel.component.ts:154`, `src/app/core/graphql/types.ts:277`

**Problem.** request() toasts a generic 'GraphQL Error' title with the raw backend message and then rethrows, and the callers (about 58 toast.error sites in features) catch the same error and toast again, so a single failed action shows two stacked toasts, one of them with developer-facing text. HTTP-level failures (offline, 5xx, 401) are not toasted or captured here at all, so the behaviour differs by failure type. There is no timeout or AbortSignal, so a hung connection leaves a submit button disabled indefinitely. GraphQLError has no extensions/code, so callers cannot distinguish 'not logged in' from 'validation failed' from 'rate limited' and parse message strings instead.

**Recommendation.** Audit the callers that do not toast themselves before changing the default. Add typed error codes and a timeout, and migrate callers to own their toasts.

_Original suggestion (corrected by the verifier):_ Make request() throw only (a typed GraphQLRequestError with code from errors[0].extensions, plus a NetworkError class wrapping HttpErrorResponse status 0) and let callers own the user-facing toast, or add an option { toast: false } and default it to false. Keep Sentry capture in one place and skip expected codes. Add a timeout (rxjs timeout({ first: 30_000 })) and an optional AbortSignal parameter wired to takeUntilDestroyed. Extend GraphQLError with extensions?: { code?: string } and export a small isAuthError()/isValidationError() helper.

**Verification.** GraphQLClient.request does toast 'GraphQL Error' with the raw message, capture to Sentry and rethrow, and callers like account-panel toast again, so double toasts are real. HTTP failures are not toasted here. Defaulting the toast off would silently drop errors for callers that rely on it.

**Also reported as:** [F530](data-reliability-and-error-states.md#f192) [gap-3] GraphQLClient.request toasts 'GraphQL Error' and reports every user-facing failure to Sentry; callers then double-toast, swallow or show raw HTTP text (src/app/core/graphql/graphql-client.ts:229, src/app/core/graphql/graphql-client.ts:239)

<details><summary>Evidence</summary>

```text
this.toast.error("GraphQL Error", error.message);
Sentry.captureException(error);
throw error;
// caller (account panel):
} catch (err) { this.toast.error("Couldn't request a code", err instanceof Error ? err.message : "Unknown error"); }
```

</details>

<a id="f217"></a>

#### F217 · Fix the line page fleet totals: they sum vehicle-type counts, not this line's vehicles

**medium** · effort M · data-fetching · gap-1

**Where:** `src/app/features/spotting/data/fleet-counts.util.ts:11-19`, `src/app/features/spotting/data/spotting.queries.ts:44-66`, `src/app/core/methodology/methodology.content.ts:274-275`, `src/app/features/spotting/line-details/line-details.page.ts:446-448`, `rosak_backend/operation/schema/loaders.py:19-27`

**Problem.** vehicleStatus*Count and vehicleTotalCount on VehicleType count every vehicle of that type on any line, and the type's vehicles list is likewise not filtered by line (batch_load_vehicle_from_vehicle_type). When a type also runs elsewhere, the spotting page's chips and the In Service share chip show a different fleet from the home board (12/16 versus 13/20 for BRT SBL in the local data), and the table lists vehicles that are not on the line. The home board's line-pulse.vehicle-count uses the correct per-line VehicleLine count, so two published 'in service' numbers for one line disagree.

**Recommendation.** Backend first: add a line-scoped variant (for example Line.vehicleTypes returning counts filtered by that line, or a vehicles(lineId) argument on VehicleType). Frontend: read the line's own inServiceVehicleCount/totalVehicleCount/vehicleStatusCounts for the chips, or filter each type's vehicles to the line before counting. Update fleet.in-service-share and bump lastReviewed.

**Verification.** fleetCountChips sums per-VehicleType counts, and batch_load_vehicle_from_vehicle_type filters only by vehicle_type_id, not by line. A type shared across lines would inflate totals.

<details><summary>Evidence</summary>

```text
const total = types.reduce((sum, t) => sum + t.vehicleTotalCount, 0);
// registry: "Vehicles in service right now, out of this line's total fleet across every vehicle type."
Live API, BRT SBL: line.inServiceVehicleCount/totalVehicleCount = 12/16, line.vehicles = 16; sum over vehicleTypes = 13 in service / 20 total
```

</details>

<a id="f220"></a>

#### F220 · A user's existing votes are invisible on /insiden, situasi and chronology rows, and on the home feed after an in-page login

**medium** · effort M · data-fetching · gap-2

**Where:** `src/app/features/home/data/home.store.ts:1007`, `src/app/features/home/data/home.store.ts:1227`, `src/app/features/insiden/links-section/links-section.component.ts:153`, `src/app/features/insiden/incident-card/incident-card.component.html:162`, `src/app/features/insiden/insiden.page.ts:92`

**Problem.** graphqlResource sends no token, so userVote is always 0. Only the home feed repairs that with an authenticated overlay, and it does so exactly once in the store constructor. If the reader signs in after the page mounted (the normal flow via 'Log in to submit links'), the overlay is never loaded and their earlier votes stay unlit until a reload. /insiden's Submitted Links tab, the situasi section and the incident and chronology vote buttons have no overlay at all, so a signed-in user never sees what they previously voted. The optimistic projection then starts from the wrong state (clicking up on an already upvoted link shows +1, then snaps back to the server value). The overlay is also two full feed reads (8 and 20 rows, about 0.9 KB per row) whose only purpose is one field.

**Recommendation.** Add a lightweight authenticated query for the caller's votes (for example `myVotes(targetType, ids)` or a `userVote`-only projection) and a shared `UserVotesStore` that reloads from an `effect` on `auth.user()` and clears on sign-out; use it for the home feed, /insiden, situasi and chronology rows. Backend change first per the repo contract. At minimum, make loadVoteOverlay re-run when isLoggedIn flips true and clear _userVotes on sign-out.

**Verification.** home.store loadVoteOverlay runs once from the constructor, awaits whenReady and returns if logged out, so a later in-page login never loads it. Grep of features/insiden shows no authenticated overlay: incident-card uses entry.userVote ?? 0 from the anonymous resource. MISTAKES.md confirms graphqlResource is anonymous-only.

**Also reported as:** [F225](data-reliability-and-error-states.md#f220) [gap-3] Viewer vote state is never loaded outside the first home page: /insiden, the situasi tab and Load More rows always show 'no vote' (src/app/app.config.ts:163, src/app/features/insiden/link-list/link-list.component.ts:45)

<details><summary>Evidence</summary>

```text
if (this.isBrowser) {
  void this.loadVoteOverlay();
}
...
private async loadVoteOverlay(): Promise<void> {
  await this.auth.whenReady;
  if (!this.auth.isLoggedIn()) { return; }
// links-section: protected readonly voteValues = signal<Record<string, number>>({});
// incident-card.html: [userVote]="entry.userVote ?? 0"  (from an anonymous graphqlResource)
```

</details>

<a id="f230"></a>

#### F230 · Make the vote overlay survive a line filter, a late login and a logout

**medium** · effort M · data-fetching · home-data

**Where:** `src/app/features/home/data/home.store.ts:1006`, `src/app/features/home/data/home.store.ts:1227`, `src/app/features/home/data/home.store.ts:1197`, `src/app/features/home/data/home.store.ts:151`, `src/app/features/home/data/home.store.ts:1232`

**Problem.** Three separate gaps. First, the 'a wider read is harmless' argument for omitting lineId is wrong: the 8 newest rows overall are not a superset of the 8 newest rows for one line, so a filtered feed (Pro line select or ?line=) shows rows the overlay never covered and renders the reader's own votes as unpressed. Second, the overlay runs once in the constructor. The store is route-scoped and retained across navigations, so a reader who logs in after the store was created (from the nav, from the draft-first sheet's Log in button, or on another page) never gets an overlay until a full reload. Third, a logout never clears _userVotes, so the previous account's votes keep showing. Also getIdToken() can reject offline and the rejection is unhandled because the call is fire-and-forget.

**Recommendation.** Drive the overlay from an effect-free reaction to auth: call fetchVotes() when auth.isLoggedIn() flips true (an effect that only calls an async method and writes through it is acceptable) and set _userVotes to {} when it flips false. Call the same method from setLineFilter() for the new variables and merge. Wrap the idToken call in try/catch so a token failure just skips the overlay.

**Verification.** The 'wider read is harmless' comment is wrong because the 8 newest overall are not a superset of the 8 newest for one line. loadVoteOverlay runs once from the constructor, the store is route-scoped and survives navigation, and login is a popup with no reload, so a late login never gets an overlay. _userVotes is never cleared on logout.

**Also reported as:** [F098](data-reliability-and-error-states.md#f230) [home-ui] The vote overlay is never reloaded when the reader signs in or out after the page has mounted (src/app/features/home/data/home.store.ts:1007, src/app/features/home/data/home.store.ts:1227); [F229](data-reliability-and-error-states.md#f230) [home-data] Fetch the vote overlay for pages added by Load More, not only the first page (src/app/features/home/data/home.store.ts:1116, src/app/features/home/data/home.store.ts:1124); [F232](data-reliability-and-error-states.md#f230) [home-ui] A rider's own votes are missing for any feed row that was not on the first page when the page loaded (src/app/features/home/data/home.store.ts:1227, src/app/features/home/data/home.store.ts:1244)

<details><summary>Evidence</summary>

```text
if (this.isBrowser) {
  void this.loadVoteOverlay();
}
...
*     rule above (an extra id costs nothing, and an absent id
*     and an unused id behave identically); a *different* read is not.
// and: const token = await this.auth.idToken();  (unguarded, outside try)
```

</details>

<a id="f274"></a>

#### F274 · Vehicles that disappear from the feed stay on the map forever, and popup HTML is rebuilt for every vehicle on every poll

**medium** · effort M · ux · tracker-gallery

**Where:** `src/app/features/tracker/data/gtfs-realtime.service.ts:121`, `src/app/features/tracker/map/rt-marker-layer.controller.ts:46`, `src/app/features/tracker/map/rt-marker-layer.controller.ts:78`

**Problem.** The comment treats growth as a fact, not a decision, and the harm is user-facing. A bus that ended its shift or a train that left the feed keeps its marker at its last known position until the user unticks the source, so the map overstates how many vehicles are running and a rider may wait for a ghost vehicle. The popup shows `Updated 3h ago`, but only if the user opens it. The markers, popups and entity map also never shrink, so a long session on a high-churn feed grows memory. Separately, `buildVehiclePopupHtml` is run and `popup.close()` or `open()` is called for every vehicle on every poll, even though popups are only seen on click.

**Recommendation.** Replace the merge with the latest snapshot plus a bounded grace: keep an id only if it is in the new feed or its `timestamp` is under about 5 minutes old, and delete markers and popups for ids that fall out (`marker.remove()`, `popups.delete`). Dim markers whose `timestamp` is older than 2 minutes with a CSS class. Build the popup HTML lazily by listening to the marker's click or `show` event and calling `setOptions` there, and diff by comparing the previous `position`/`timestamp` so unchanged vehicles are skipped. Show a visible `Updated hh:mm:ss` freshness chip for each source on the map.

**Verification.** redraw's own comment says feedEntities only grows; the merge in refresh() never drops ids, so departed vehicles stay as ghost markers. Popup HTML is rebuilt and open/close called for every vehicle each poll.

**Also reported as:** [F028](data-reliability-and-error-states.md#f274) [ux-rest] Vehicles that disappear from a feed stay on the map forever as ghost markers (src/app/features/tracker/data/gtfs-realtime.service.ts:121, src/app/features/tracker/map/rt-marker-layer.controller.ts:42); [F557](data-reliability-and-error-states.md#f274) [performance] Tracker vehicle state only grows: ghost markers never expire and every poll rebuilds all markers and popups (src/app/features/tracker/data/gtfs-realtime.service.ts:121, src/app/features/tracker/map/rt-marker-layer.controller.ts:47)

<details><summary>Evidence</summary>

```text
const entities: IFeedEntity = { ...this.feedEntities() };
for (const entity of feed.entity) { ... entities[id] = entity.vehicle; }
...
// since `feedEntities` itself only ever grows (RtSource merges into its existing map).
...
popup.instance.setOptions({ html: buildVehiclePopupHtml(vehicle) });
```

</details>

<a id="f301"></a>

#### F301 · Spotting queue offset paging plus local row removal produces duplicate rows and a stale total

**low** · effort S · reliability · console · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/console/console.page.ts:281`, `src/app/features/console/console.page.ts:248`, `src/app/features/console/console.page.ts:286`, `src/app/features/console/console.page.html:174`

**Problem.** The next page offset is the number of rows currently on screen. That is correct only while every removed row also leaves the server's result set. Marking rows read removes them locally even when the Read filter is Any or Yes (they stay in the server result), so Load more repeats rows already shown. New reports arriving at the top of the `created DESC` order shift every later page the same way. Duplicate ids cause two rows with the same `track` key (NG0955 in dev, duplicated or misplaced DOM) and a selection checkbox that toggles both. `totalCount` is also never decremented after marking rows read.

**Recommendation.** De-duplicate by id on append; only remove rows locally when isRead:false is applied.

_Original suggestion (corrected by the verifier):_ Merge pages through a de-duplicating step: `const seen = new Set(list.map(e => e.id)); [...list, ...data.events.filter(e => !seen.has(e.id))]`. Prefer keyset paging (`created` before the last row's `created`) if the backend filter supports it. Only remove rows locally when the applied filter has `isRead: false`; otherwise mark them as read in place (grey them out). Decrement or refetch the count after a bulk action.

**Verification.** Offset is events().length and ids are appended without de-duplication, and totalCount is not decremented. But the default filter is isRead:false, so local removal after mark-read matches the server unless the user widened the filter. Duplicates then need new reports to land mid-session.

<details><summary>Evidence</summary>

```text
eventPagination: { limit: PAGE_SIZE, offset: this.events().length },
...
this.events.update((list) => [...list, ...data.events]);
this.events.update((list) => list.filter((e) => !ids.includes(e.id)));   // after markAsRead
@for (event of events(); track event.id)
```

</details>

<a id="f313"></a>

#### F313 · ThemeService touches localStorage unguarded in the root component's dependency chain

**low** · effort S · reliability · core-shell · partially confirmed · severity adjusted from medium

**Where:** `src/app/core/theme/theme.service.ts:38`, `src/app/core/theme/theme.service.ts:58`, `src/app/app.ts:11`, `src/index.html:23`

**Problem.** App injects ThemeService, so a SecurityError from localStorage (Chrome with all site data blocked, Firefox strict storage settings, sandboxed iframes, some in-app browsers) throws during the root component's construction and the whole SPA fails to render, even though the inline script in index.html and PreferencesService both wrap the same access in try/catch. cycle() also throws when the quota is full. The Auth service has the same unguarded access (auth.service.ts:86, 108).

**Recommendation.** Add one small safeStorage helper in core (getItem/setItem returning null or false on exceptions) and use it in ThemeService, AuthService and PreferencesService instead of three separate patterns. Add a spec that stubs localStorage to throw.

**Verification.** ThemeService reads and writes localStorage unguarded in its constructor and in cycle(), while index.html guards the same read. Blocked storage is real, but a SecurityError there is uncommon, so the harm is narrower than 'whole SPA fails'.

**Also reported as:** [F442](data-reliability-and-error-states.md#f313) [test-gaps] ThemeService reads localStorage without a guard in a constructor that the root App injects (src/app/core/theme/theme.service.ts:33-41, src/app/app.ts:14); [F463](data-reliability-and-error-states.md#f313) [ui-system] ThemeService reads and writes localStorage without try/catch although index.html already treats it as fallible (src/app/core/theme/theme.service.ts:38, src/app/core/theme/theme.service.ts:58)

<details><summary>Evidence</summary>

```text
const stored = localStorage.getItem(STORAGE_KEY);   // constructor, no try/catch
...
if (this.isBrowser) { localStorage.setItem(STORAGE_KEY, next); }
// index.html guards the same read: try { ... } catch { /* localStorage unavailable (e.g. private mode) */ }
```

</details>

<a id="f362"></a>

#### F362 · Make the polling beat respect outages, going offline and idle tabs

**low** · effort S · reliability · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/core/polling/polling-source.ts:109`, `src/app/core/polling/polling-source.ts:140`, `src/app/features/home/data/home.store.ts:952`, `src/app/features/home/home.page.ts:557`, `src/app/core/graphql/graphql-client.ts:127`

**Problem.** The header says there is no backoff on purpose, but the home beat now sits on top of graphqlResource's exponential retry. During an outage each resource is reloaded every 30 seconds whatever its own backoff says (up to 3 minutes), so the backoff never actually grows and the extra reload also resets the retry countdown; the page hides that countdown by returning null for retryCountdownSec, which hides the mismatch rather than fixing it. PollingSource listens only to visibilitychange: it does not skip while navigator.onLine is false, does not refresh when the connection comes back (the reader waits up to 30 s for a status board), and keeps polling at the same rate for a foreground tab nobody has touched for an hour. Last Week also keeps polling after the reader switches back to Today because it stays requested.

**Recommendation.** Add an 'online' listener that calls refreshNow() and skip ticks while navigator.onLine is false; drop the idle-stretching and the Last Week suggestions as speculative.

_Original suggestion (corrected by the verifier):_ Give PollingSource an optional shouldSkip callback and an online listener: skip the tick while navigator.onLine is false or while store.hasError() is true (the resource is already retrying), call refreshNow() on the online event, and stretch the interval to 60 to 120 s after several minutes without pointer or key activity. Stop reloading lastWeekResource while the Today tab is showing. Show the real retryCountdownSec of the lines resource in the banner.

**Verification.** PollingSource only listens to visibilitychange and has no online/offline handling, and the 30s beat does preempt the retry timer during an outage. But a 30s reload during an outage is arguably desirable faster recovery, and attempts still increment on each failure, so harm is small.

<details><summary>Evidence</summary>

```text
this.pollTimeout = setTimeout(() => {
  this.onRefresh();
  this.scheduleNext(this.intervalMs() ?? Infinity);
}, delayMs);
// home.page.ts: retryCountdownSec: () => null,
// graphql-client.ts: delayMs = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt(), RETRY_MAX_DELAY_MS)
```

</details>

<a id="f364"></a>

#### F364 · Do not count a phased-opening PARTIAL_ACTIVE line as permanently needing attention

**low** · effort S · reliability · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/network-summary.util.ts:88`, `src/app/features/home/data/network-summary.util.ts:34`, `src/app/features/home/data/network-summary.util.ts:48`

**Problem.** TESTING and DEFUNCT are excluded because they are standing administrative facts, not live conditions. The backend defines PARTIAL_ACTIVE the same way: a line whose later phases have not opened yet, which can last months. The rule treats it as 'not fully operational', so such a line sits in Needs attention, lowers the headline to 'N-1 of N running normally' and pushes the hero tone to degraded the whole time. That trains readers to ignore amber, which the file's own tone comment says it wants to avoid.

**Recommendation.** Ask the maintainer; only change the rule and the network.needs-attention methodology entry if a phased-opening line is actually expected to sit in PARTIAL_ACTIVE for months.

_Original suggestion (corrected by the verifier):_ Treat PARTIAL_ACTIVE as in service but not an attention condition (keep its badge and its place in the severity sort), reserving attention for PARTIAL_DISRUPTION, TOTAL_DISRUPTION and a Delayed-or-worse rider report. Update the network.needs-attention methodology entry, bump lastReviewed and add a spec case.

**Verification.** lineNeedsAttention does treat PARTIAL_ACTIVE as needing attention, but the file's comments explicitly decide 'every PARTIAL/TOTAL state is a live operational condition', and the live SSR data contains no PARTIAL_ACTIVE line. This is a hypothetical product-policy question for the maintainer, not a defect.

<details><summary>Evidence</summary>

```text
export function lineNeedsAttention(line: LinePulse): boolean {
  return (
    isInService(line) &&
    (line.status !== "ACTIVE" || passengerSeverityRank(line.passengerStatus) >= NEEDS_ATTENTION_PASSENGER_RANK)
  );
}
// backend enum comment: PARTIAL_ACTIVE = 'When part of the entire line is active. E.g. MRT Phase 1, 2'
```

</details>

<a id="f365"></a>

#### F365 · Make the status helpers total so a new backend enum value cannot throw inside the hero's computed

**low** · effort S · reliability · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/network-summary.util.ts:245`, `src/app/features/home/data/network-summary.util.ts:109`, `src/app/features/home/data/status-info.util.ts:179`, `src/app/features/home/data/passenger-status.util.ts:270`

**Problem.** The enums are hand-copied (no codegen). If the backend adds a LineStatus or PassengerStatus value, lineStatusInfo returns undefined and .title throws, PASSENGER_LABEL[x].toLowerCase() throws, and LINE_STATUS_SEVERITY_RANK[b.status] becomes NaN so the sort comparator returns NaN. summarizeNetwork is a computed read by the hero and the board, so one unknown value takes both down. The sibling utilities (statusConfidence) are carefully total, these are not.

**Recommendation.** Add fallbacks: lineStatusInfo(status) ?? { title: status, body: '' }, passengerLabel(status) falling back to the raw string, and rank lookups defaulting to 0. Add a spec that feeds an unknown status through summarizeNetwork and the comparators, and a cheap contract test that compares the enum lists with the introspected schema when the local API is available.

**Verification.** lineStatusInfo returns LINE_STATUS_INFO[status] and lineCallout calls .title/.toLowerCase on it, so an unknown backend enum would throw; enums are hand-copied. It only triggers on a new backend value (backend-first deploy window), so it is hypothetical hardening.

<details><summary>Evidence</summary>

```text
return `${line.code} — ${lineStatusInfo(line.status).title}`;
return `${line.code} — riders report it ${passengerLabel(line.passengerStatus).toLowerCase()}`;
export function lineStatusInfo(status: LineStatus): StatusInfo { return LINE_STATUS_INFO[status]; }
```

</details>

<a id="f401"></a>

#### F401 · Malformed URLs and missing assets fall through to a full SSR render (500 with stack trace, or a 56 KB 404 page)

**low** · effort S · reliability · platform · severity adjusted from medium

**Where:** `src/server.ts:83`, `src/server.ts:94`, `src/server.ts:119`

**Problem.** express.static is followed directly by the Angular catch-all, so any path that is not a real file is server-rendered in full. Bots probing for wp-login.php or .env, and stale tabs requesting an old hashed chunk after a deploy, each cost roughly 0.6 to 0.9 s of the single CPU and a 56 KB response. Separately, a bad percent-encoding makes Angular's router throw, which Sentry captures as an error event and Express answers with its default HTML error page; outside NODE_ENV=production that page includes the stack trace and file paths.

**Recommendation.** Before the SSR middleware add `app.use((req, res, next) => path.extname(req.path) && !req.path.endsWith('.html') ? res.status(404).set('Cache-Control','public, max-age=60').type('text').send('Not found') : next());`. Add a final error handler after Sentry.setupExpressErrorHandler: `app.use((err, _req, res, _next) => res.status(err instanceof URIError ? 400 : 500).type('text').send('Something went wrong'));`. Optionally reject non GET/HEAD methods with 405, since POST / currently renders the page with 200.

**Verification.** express.static is followed directly by the catch-all SSR handler in server.ts, so unknown paths with file extensions are fully rendered. Sentry.setupExpressErrorHandler re-throws to Express's default handler, which matches the URIError 500. The cost is bounded.

<details><summary>Evidence</summary>

```text
GET /%E0%A4%A -> HTTP 500 with body '<pre>URIError: URI malformed ... at e.getPathSegments (file:///.../main.server.mjs:50:2148)'. GET /chunk-DEADBEEF.js -> 404, 55,955 bytes of HTML, 0.58 s; /wp-login.php 56,160 bytes 0.72 s; /.env 55,917 bytes 0.83 s; /apple-touch-icon.png 56,184 bytes 0.89 s. No Cache-Control on any of them.
```

</details>

<a id="f412"></a>

#### F412 · Validate build-time config in the generate scripts and fail loudly when staging would use production values

**low** · effort S · reliability · platform · partially confirmed

**Where:** `scripts/generate-runtime-config.mjs:25`, `scripts/generate-runtime-config.mjs:31`, `scripts/generate-firebase-config.mjs:32`, `scripts/generate-firebase-config.mjs:34`, `apphosting.yaml:24`

**Problem.** `??` does not catch empty strings, so BACKEND_URL= or UPLOAD_CONCURRENCY=abc produces an empty backend URL or NaN/0 concurrency and a build that succeeds but is broken. A staging backend whose 'Environment name' setting is missing silently builds with production backend URLs, Mapbox token and Firebase config, so staging users could write to production. The script then bakes every runtime variable into the bundle at build time anyway, so the availability: [BUILD, RUNTIME] markers in apphosting.yaml suggest a runtime override that does not exist. The Mapbox pk. token in apphosting.yaml and the scripts should be checked for URL restrictions in the Mapbox dashboard (public tokens are meant to be public, restriction is what protects quota).

**Recommendation.** After computing config, validate: `new URL(config.backendUrl)`, `Number.isInteger(config.uploadConcurrency) && config.uploadConcurrency > 0`, and non-empty strings, and `process.exit(1)` otherwise. When ENVIRONMENT_NAME is 'staging' assert that backendUrl is not the production host. Change BACKEND_URL and BACKEND_GRAPHQL_URL to availability: [BUILD] to match reality, and fail (not warn) on invalid FIREBASE_WEBAPP_CONFIG when running inside App Hosting.

**Verification.** generate-runtime-config.mjs uses ?? with no validation, and Number() on a bad value gives NaN. The values come from the maintainer's own apphosting yaml. The staging-uses-production-config scenario requires a console misconfiguration.

<details><summary>Evidence</summary>

```text
uploadConcurrency: Number(process.env["UPLOAD_CONCURRENCY"] ?? FALLBACK.uploadConcurrency),  backendUrl: process.env["BACKEND_URL"] ?? FALLBACK.backendUrl,  and in generate-firebase-config.mjs an invalid FIREBASE_WEBAPP_CONFIG only does console.warn(...) and `return FALLBACK`.
```

</details>

<a id="f413"></a>

#### F413 · Handle SIGTERM and flush Sentry so scale-down does not drop in-flight renders

**low** · effort S · reliability · platform · partially confirmed

**Where:** `src/server.ts:125`, `src/server.ts:127`

**Problem.** Cloud Run sends SIGTERM on scale-down and deploys. Node's default behaviour is to exit immediately, so renders in flight are cut off and the Sentry events queued in that process (including the error that may have caused the restart) are never sent. The default 5 s keep-alive timeout is also shorter than the idle timeout of Google's front end, a known cause of sporadic 502s on reused connections.

**Recommendation.** Keep the server: `const server = app.listen(...); process.on('SIGTERM', async () => { server.close(); await Sentry.close(2000); process.exit(0); });` and set `server.keepAliveTimeout = 65_000; server.headersTimeout = 66_000;`.

**Verification.** server.ts calls app.listen without keeping the server and has no SIGTERM handler. Cloud Run gives a 10 s grace period, and Sentry's Node SDK may flush on its own. The keepAliveTimeout point is a real, known 502 source behind Google's front end, but the overall impact is small.

<details><summary>Evidence</summary>

```text
app.listen(port, (error) => { if (error) { throw error; } console.log(`Node Express server listening on http://localhost:${port}`); });  The returned http.Server is not kept, there is no process.on('SIGTERM') handler, and responses advertise 'Keep-Alive: timeout=5'.
```

</details>

<a id="f429"></a>

#### F429 · isAdmin is read once from the cached ID token and never refreshed

**low** · effort S · reliability · security · partially confirmed

**Where:** `src/app/core/auth/auth.service.ts:81`, `src/app/core/auth/auth.service.ts:85`

**Problem.** onAuthStateChanged fires on sign-in and sign-out, not when the token refreshes, and getIdTokenResult() without forceRefresh returns the cached token. A newly promoted admin sees no console until they reload after the hourly refresh (or sign out and in), and a demoted admin keeps the console UI for up to an hour. The sibling check in Firestore rules uses a different source of truth (users/{uid}.permissions.admin, not the 'admin' custom claim), so the client flag and the rule can disagree: a user with the claim but without the Firestore permission sees the About editor and gets a 'Save failed' toast. Server enforcement is intact; this is a UX and consistency issue. The async callback can also race (a quick sign-out then sign-in applies results out of order).

**Recommendation.** Use onIdTokenChanged, which fires on refresh, and guard against out-of-order completion by comparing the user's uid after the await. Pick one admin source of truth and document it: either also write the claim when setting users/{uid}.permissions.admin, or make the Firestore rule check request.auth.token.admin == true. Mirror the Firestore rules into the repo (see the next finding).

**Verification.** auth.service.ts reads the claim once in onAuthStateChanged without refreshing, as stated. The server enforces admin independently, so the effect is only UI staleness. The claim-versus-Firestore source mismatch is plausible but I did not verify it.

<details><summary>Evidence</summary>

```text
onAuthStateChanged(this.auth, async (user) => {
  ...
  this.isAdmin.set(user !== null && (await user.getIdTokenResult()).claims["admin"] === true);
```

</details>

<a id="f536"></a>

#### F536 · Refresh the service-day history on the beat or manual click, and stop the open chart refetching the same data

**low** · effort M · data-fetching · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/home.store.ts:1092`, `src/app/features/home/data/home.store.ts:1057`, `src/app/features/home/line-pulse/line-status-chart.component.ts:204`, `src/app/features/home/line-pulse/line-status-chart.component.ts:213`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:360`

**Problem.** Neither the 30-second beat nor the manual Refresh button reloads linesHistoryResource or networkHistoryResource, so the row label 'N reports (X this hour)', the hero sparkline, the heat grid and the ranking stay at their page-load snapshot even though the status chips beside them refresh and the control says 'Updated'. These are exactly the numbers that move during an incident. Meanwhile an expanded card or row issues its own LineStatusHistory request for the same hourly buckets the store already holds for that line, and re-issues it on every beat, so the page both ignores the shared copy and pays twice for it. The chart also sends dayStartHour 3 while the store deliberately omits it, a second definition of the same constant.

**Recommendation.** Reload the history resources on the manual Refresh click (not every beat), and drop the chart's duplicate dayStartHour constant and explicit variable.

_Original suggestion (corrected by the verifier):_ Make the chart read store.linesHistoryFor(lineId) and delete its own resource, refresh, effect and duplicated SERVICE_DAY_START_HOUR. In HomeStore reload linesHistoryResource and networkHistoryResource on manual refreshes and every second or third beat (or on each beat while any row is expanded or the Pro view is mounted), keeping the variables static so TransferState reuse is unaffected.

**Verification.** Not reloading the history resources on the beat is a documented decision (reloadAll comment: a chart redrawing every 30s is noise), though the manual refresh also skipping it leaves 'N reports' stale. The per-line chart does issue its own LineStatusHistory request and sends dayStartHour 3 while the store omits it, a minor duplication.

<details><summary>Evidence</summary>

```text
reloadFirstPages(): lines.reload(); linesRefreshTick++; feed.reload(); lastWeek (history reads absent)
// chart: variables: { lineId: this.lineId(), dayStartHour: SERVICE_DAY_START_HOUR }, query LINE_STATUS_HISTORY_QUERY
// row:   _buckets = computed(() => this.store.linesHistoryFor(this.line().id))
```

</details>
