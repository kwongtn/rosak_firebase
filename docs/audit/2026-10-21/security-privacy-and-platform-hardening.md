# Security, privacy and platform hardening

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 26 findings, most severe first.

Outdated SSR packages, exposed GPS/EXIF, no consent or security headers, an SSRF-prone extract endpoint, open GTFS proxy and unversioned Firestore rules.

<a id="f015"></a>

#### F015 · Upgrade Angular 22.1.0 SSR packages: npm audit lists several high-severity SSR advisories

**high** · effort S · security · security

**Status, fix pass 2026-10-21:** Fixed (`698b61a`). All `@angular/*` packages are on 22.2.3, and `npm audit --omit=dev` lists no Angular advisories. The advisories it cleared were moderate (`@angular/common` HttpTransferCache, `@angular/ssr` CommonEngine); the high-severity router and platform-server items in this write-up did not show in the audit run.

**Where:** `package.json:34`, `package.json:39`, `package.json:40`, `package.json:41`

**Problem.** The site server-renders /, /spotting, /insiden, /gallery and the catch-all, so the vulnerable platform-server and router code runs on every public request. The router DoS items and the malformed-DOCTYPE loop can be triggered by an anonymous visitor with a crafted URL, and they would pin one of at most 4 App Hosting instances (concurrency 20, 1 CPU). The SSRF and open-redirect items also matter because the SSR engine resolves URLs from request data. The range in package.json (^22.1.0) already permits the fixed versions, so only the lockfile holds the app back.

**Recommendation.** Run npm update for @angular/core, common, router, platform-browser, platform-server, forms, compiler, @angular/ssr and @angular/build together so they land on 22.2.1 or later, then rebuild and run the test suite. Re-run npm audit afterwards. The other audit hits (maplibre-gl, markdown-it, @grpc/grpc-js via firebase, proxy-addr, qs) come from transitive packages or Node-only code paths this app does not exercise in the browser or in the Express server, so they are not worth chasing before this one.

**Verification.** package.json uses ^22.1.0 and package-lock resolves platform-server to 22.1.0, so the range allows fixes and only the lockfile blocks them. I did not re-run npm audit, so the advisory list is taken on trust, but the SSR attack surface is real.

**Second check (high-severity pass).** code review: holds (high). node_modules and the lockfile resolve @angular/core, router and platform-server to 22.1.0, and npm audit --omit=dev reports platform-server as high (SSR XSS, SSRF, DOCTYPE loop, open redirect; fixed in 22.1.4 to 22.2.1) and router as high (three SSR DoS advisories, fixed in 22.2.0 and 22.2.1). package.json ranges are ^22.1.0, and the registry has 22.2.1 to 22.2.3, so a lockfile update is enough. The site uses RenderMode.Server on /, /spotting, /insiden, /gallery and the catch-all, and apphosting.yaml sets maxInstances 4 and concurrency 20, so a request-triggered router DoS is plausible. One caveat: the DOCTYPE loop depends on malformed markup in the rendered document, which a visitor probably cannot control, so it is less exploitable than the router items. I did not run a DoS reproduction. impact review: holds (high). The installed node_modules/@angular/core and platform-server are 22.1.0. The audit evidence lists SSR advisories (infinite loop on malformed DOCTYPE, router DoS, open redirect, SSRF-style URL resolution) fixed in 22.1.4 through 22.2.1. This app server-renders public routes, so an anonymous request can reach the vulnerable code, and the finding's description of a small instance pool (about 4 instances, 1 CPU) makes a hang costly. The caret range already allows the fixed versions, so this is a lockfile-only update. I could not re-run npm audit here because that would query the network, so the exact advisory details rest on the finding's evidence.

**Fix note from the second check.** Run `npm update` on the @angular/* packages together (core, common, compiler, forms, platform-browser, platform-server, router, @angular/ssr, @angular/build, cli, compiler-cli) to 22.2.3, then rebuild, run tests and re-audit. No package.json range change is needed. Run npm update on the @angular/* packages together, plus @angular/ssr and @angular/build, then npm audit, build and npm test -- --no-watch. Prioritise this ahead of the transitive audit hits.

<details><summary>Evidence</summary>

```text
package-lock resolves @angular/common/core/router/platform-server to 22.1.0. npm audit --omit=dev: platform-server 'SSR XSS via Unescaped <template> Content' (<22.1.4), 'SSRF and Cross-Origin Credential Disclosure via URL Resolution Discrepancy in SSR' (<22.1.4), 'DoS via Infinite Loop on Malformed DOCTYPE' (<22.1.6), 'Open Redirect via Protocol-Relative URLs in SSR' (<22.2.1); router: three SSR DoS advisories (<22.2.0 / <22.2.1).
```

</details>

<a id="f125"></a>

#### F125 · Stop serving unhashed public files with a one-year cache lifetime (version.json, favicons, robots.txt, ads.txt)

**medium** · effort S · reliability · platform

**Where:** `src/server.ts:83`, `scripts/generate-build-info.mjs:34`, `src/app/core/version/new-version.service.ts:53`

**Problem.** The one-year policy is correct for the content-hashed bundles but is applied to everything in public/ as well. version.json is the file the NewVersionService polls to learn that a deploy happened; the client sends cache:'no-store', but any CDN or proxy that honours the origin header can serve a stale copy for a year, which silently disables the new-version prompt. A changed favicon, ads.txt or robots.txt also stays in browsers and intermediaries for a year. Hashed files lack `immutable`, so browsers still revalidate on reload.

**Recommendation.** Use `setHeaders` so only hashed files get the long policy: `express.static(dir, { index:false, redirect:false, setHeaders: (res, p) => res.setHeader('Cache-Control', /-[A-Za-z0-9_]{8}\.(js|css|woff2?)$/.test(p) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate') })`. Give version.json `no-store` explicitly. Keep the hashed-file regex in a tiny pure function so it can be unit tested like server-cache-control.ts.

**Verification.** express.static uses maxAge '1y' for everything in dist/browser, including version.json, robots.txt and favicons. The client fetch uses no-store, but an intermediary that honours the origin header could still serve a stale copy. Hashed bundles should get immutable.

**Also reported as:** [F394](security-privacy-and-platform-hardening.md#f125) [performance] Fix cache headers for unhashed static files and add immutable to hashed ones (src/server.ts:83, src/app/core/version/new-version.service.ts:53)

<details><summary>Evidence</summary>

```text
express.static(browserDistFolder, { maxAge: "1y", index: false, redirect: false })  Measured response headers: /version.json -> 'Cache-Control: public, max-age=31536000'; /robots.txt, /favicon.svg and the hashed main-PHLJPND6.js all carry the same value. Hashed files are not marked immutable.
```

</details>

<a id="f129"></a>

#### F129 · Firestore and Storage rules live only in the console; nothing in the repo versions or tests them

**medium** · effort S · dx-tooling · security

**Where:** `firebase.json:1`, `src/app/features/about/about.page.ts:225`, `src/app/features/tracker/data/geojson-storage.service.ts:1`

**Problem.** The live rules are sound today (deny-by-default, public read only under public/, admin-only writes verified through a users document, users readable only by their owner), but they exist only in the Firebase console. About-page edits go straight to setDoc from the browser, and the whole protection against a defaced About or GDPR page is these rules. Without a checked-in copy, a console edit can silently open them, and reviewers cannot see a change. `allow write, update` is also redundant (write covers update), and the rule does one extra get() per write.

**Recommendation.** Add firestore.rules and storage.rules to the repo, reference them from firebase.json ("firestore": {"rules": "firestore.rules"}, "storage": {"rules": "storage.rules"}), and add a small @firebase/rules-unit-testing spec (anonymous cannot write public/about, non-admin cannot, admin can). Deploy them through CI instead of the console.

**Verification.** firebase.json has no firestore or storage blocks and the repo contains no .rules files. Versioning rules in the repo is sound practice, but the live rules were reported as sound.

**Also reported as:** [F423](security-privacy-and-platform-hardening.md#f129) [profile-about-misc] Align the client-side 'admin' gate with what Firestore actually enforces, and put the rules in the repo (src/app/core/auth/auth.service.ts:85, src/app/features/about/about.page.html:19)

<details><summary>Evidence</summary>

```text
firebase.json contains only "functions" and "apphosting" blocks (no "firestore" or "storage" key, and no *.rules file in the repo).
Live Firestore rules (read via the Firebase MCP): `match /public/{document=**} { allow read; allow write, update: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.permissions.admin; }`
Storage: `match /public/{allPaths=**} { allow read; }` and everything else `if false`.
```

</details>

<a id="f040"></a>

#### F040 · Move Cloud Functions off Node 20 and the deprecated Gen1 / Gemini SDK stack

**medium** · effort M · reliability · platform · second check set severity high → medium

**Where:** `functions/package.json:15`, `.github/workflows/deploy-functions.yml:46`, `functions/.nvmrc:1`, `functions/package.json:19`, `functions/src/index.ts:39`

**Problem.** Node.js 20 left upstream support in April 2026, and by Google's runtime schedule (please verify the exact date in the console deprecation notice) Cloud Functions stops allowing deploys and then running on it around the end of this month. The AI extraction and summarise features in the incident form and the admin queue depend on this function, so they would stop working. @google/generative-ai is the old Gemini SDK (replaced by @google/genai) and GEMINI_MODEL defaults to gemini-2.5-flash, which should be checked against Google's model retirement list. MISTAKES.md records the earlier Node 18 to 20 bump but the same cycle has come round again. The root app requires Node 24.

**Recommendation.** Bump engines and the workflow to Node 22 or 24, move to firebase-functions v6 with Gen2 `onRequest` (`import { onRequest } from 'firebase-functions/v2/https'`, `region`, `secrets`, `memory`, `timeoutSeconds`, `concurrency`), migrate to @google/genai, and keep a note in docs with each runtime's end-of-support date so this is caught ahead of time. Check the Firebase console for the exact decommission date today.

**Verification.** functions/package.json has engines node 20, the deploy workflow and .nvmrc use Node 20, and firebase-functions ^5 and @google/generative-ai ^0.17 are old. Node 20 on Cloud Functions is scheduled for deprecation and decommission around late 2026, which is close to today (2026-10-21). The exact date should be checked in the console.

**Second check (high-severity pass).** code review: partially (medium). Runtime part holds. functions/package.json has "engines": {"node": "20"}, functions/.nvmrc is 20, and the deploy workflow uses node-version: 20. Google's runtime-support page (updated 2026-10-13) lists nodejs20 decommission as 2026-10-30, nine days from today, and says creation and redeployment are blocked after that date. The same page says existing functions "may be disabled" and are not guaranteed to stop, so the claim that the AI features would stop running is overstated. The real near-term harm is that no hotfix or redeploy of extractIncidentData/summarizeIncident is possible after that date. The Gemini model claim is refuted: Google's deprecations page says gemini-2.5-flash has no announced shutdown date. @google/generative-ai ^0.17.2 is an old SDK but still works. The code is Gen1 (functions.region(...).runWith(...).https.onCall, firebase-functions 5.1.1 installed), and Gen1 still runs on Node 22, so the Gen2 and SDK migration is not needed to meet the deadline. impact review: holds (high). functions/package.json pins engines node 20, functions/.nvmrc is 20, and the deploy workflow uses node-version 20. Node 20 reached end of support in April 2026 and Google's Cloud Functions schedule puts decommission around the end of this month (today is 2026-10-21), so deploys and then runs of the AI extract and summarise callables would stop. The deadline is days away, which justifies high, though the date should be confirmed in the console. The proposed fix is too large for the urgency: the Gen2 rewrite and the @google/genai migration are not required to stay on a supported runtime.

**Fix note from the second check.** Do only the runtime bump now. Change engines.node to 22 (or 24) in functions/package.json, change functions/.nvmrc, change node-version in .github/workflows/deploy-functions.yml, and change @types/node to match. Then run npm ci, build and test in functions/. Node 22 is decommissioned 2027-10-31, Node 24 on 2028-10-31. Treat the Gen2 migration and the @google/genai move as separate, non-urgent follow-ups. Drop the gemini-2.5-flash retirement concern. Do now: set engines.node, functions/.nvmrc and the workflow node-version to 22, bump @types/node to ^22, and redeploy. firebase-functions v5 Gen1 and firebase-admin 12 run on Node 22. Treat the Gen2 move, the @google/genai SDK and the gemini-2.5-flash retirement check as separate lower-priority follow-ups.

**Also reported as:** [F207](security-privacy-and-platform-hardening.md#f040) [deps-tooling] Functions runtime is pinned to Node 20, which is past its end of life, and the Gemini SDK may be deprecated (functions/package.json:14-16, functions/package.json:19)

<details><summary>Evidence</summary>

```text
"engines": { "node": "20" }, deploy workflow `node-version: 20`, functions/.nvmrc `20`. Dependencies: "@google/generative-ai": "^0.17.0", "firebase-functions": "^5.0.0", "firebase-admin": "^12.0.0". Code uses the Gen1 API: functions.region("asia-southeast1").runWith({...}).https.onRequest(app). Today's date is 2026-10-21.
```

</details>

<a id="f043"></a>

#### F043 · Anonymous spotting reports expose exact GPS coordinates through the public API, and the form never says so

**medium** · effort M · security · spotting · second check set severity high → medium

**Status, fix pass 2026-10-21:** Fixed (backend `0a830bf`, backend `d94380f`, backend `73b1006`, `d583b5d`, `ed0b764`, `52f8731`). For an anonymous spotting, the location, the public-profile rows and counts, and the uploader of its photos are hidden from everyone but the reporter and admins. The form sends only latitude, longitude and accuracy, and says the position is public unless the report is anonymous.

**Where:** `src/app/features/spotting/data/spotting.queries.ts:201`, `src/app/features/spotting/report-form/report-form.component.ts:295`, `src/app/features/spotting/report-form/report-form.component.html:164`

**Problem.** A reporter who ticks 'Submit anonymously' and picks 'Location (GPS)' has their full-precision position (7 decimal places, about 1 cm) readable by anyone, tied to a vehicle and date. The form copy says 'We won't know your exact location until you submit', which implies it stays private. VEHICLE_EVENTS_QUERY also requests the whole `location` block even though no template renders it, so the app itself helps move this data around. The leak is mainly a backend resolver issue, but the frontend sends more precision than any feature needs and gives no disclosure.

**Recommendation.** Backend first: null out `location` for anonymous events and for non-owners (or expose only a coarse value). Frontend: remove the `location { ... }` selection from VEHICLE_EVENTS_QUERY, send only latitude, longitude and accuracy, round coordinates to 3 decimals (about 110 m) before sending, drop altitude, speed and heading, and change the helper text to say plainly that the spotting position is shown to the public. Consider hiding the 'Location (GPS)' option behind a short consent line when 'Submit anonymously' is ticked.

**Verification.** Ran the unauthenticated query against localhost:8000 and it returned exact lon/lat for anonymous LOCATION events. The form sends full-precision coords (report-form.component.ts:295) and VEHICLE_EVENTS_QUERY selects `location` though no template renders it.

**Second check (high-severity pass).** code review: partially (medium). The data exposure is reproduced. An unauthenticated POST to localhost:8000/graphql/ with events(filters:{isAnonymous:true, type:{exact:"LOCATION"}}){ id location{ location accuracy } } returns event 7782 with location [101.66606, 2.9172367], plus other events with coordinates. No reporter or ownership gating exists in the resolver or filter, and is_anonymous is even a public filter field. The front end does select the whole location block in VEHICLE_EVENTS_QUERY (spotting.queries.ts, lines 201-210) and sends altitude, speed and heading in the mutation. Three parts are overstated. First, the "about 1 cm" precision is meaningless, because the browser's own accuracy value is tens of metres (47 m, 61 m, even 1246 m in the data) and the vehicle position is the point of a LOCATION spotting anyway. Second, the form text "We won't know your exact location until you submit" does not claim privacy after submit, it only says nothing about publication. Third, the anonymity concern is about linking the reporter to a place, and no reporter identity is returned in the query I ran. It is still a real, backend-side gap that should be fixed, but it is contained. impact review: partially (medium). The code matches: report-form.component.ts sends full-precision latitude, longitude, altitude, speed and heading, and VEHICLE_EVENTS_QUERY requests the whole location block even though no spotting template reads it. The recorded unauthenticated query also returned coordinates for isAnonymous events, so the privacy claim about the backend is credible. However, the location is the position of the spotted train at that time, which is the point of a LOCATION report, so it is meant to be shown publicly; the real harm is only that anonymous reporters are located and that the helper text implies privacy. Impact is limited to people choosing the GPS option while anonymous, so medium fits better than high. The frontend items (round to 3 decimals, drop altitude, speed and heading) would degrade the feature and are optional.

**Fix note from the second check.** Backend, one change: in the Event location resolver, return null when event.is_anonymous is true and the viewer is not the reporter, or coarsen the point. Frontend, smaller than proposed: remove the unused location{...} selection from VEHICLE_EVENTS_QUERY, stop sending altitude, altitudeAccuracy, speed and heading, and add one sentence to the helper text saying the position is shown publicly. Rounding to 3 decimals is optional. Backend: return null or a coarse location for anonymous events to non-owners. Frontend: remove the unused location selection from VEHICLE_EVENTS_QUERY and change the helper text to say the spotted position is shown publicly. Skip the rounding and the consent gate unless the product owner wants them.

<details><summary>Evidence</summary>

```text
Unauthenticated query against the local API: events(filters:{type:{exact:"LOCATION"}, isAnonymous:true}){ id location{ location } } returned [{"id":"7782","location":{"location":[101.66606,2.9172367]}}, ...]. The frontend sends latitude, longitude, altitude, speed and heading: `location: m.type === "LOCATION" && location ? { accuracy: ..., heading: location.heading, speed: location.speed, latitude: location.latitude, longitude: location.longitude, altitude: location.altitude }`
```

</details>

<a id="f044"></a>

#### F044 · Photos keep their EXIF GPS and device data, and the compression path deliberately copies it back in

**medium** · effort M · security · spotting · partially confirmed · second check set severity high → medium

**Status, fix pass 2026-10-21:** Partly fixed (`4e8adbe`, `46ade1f`, `05b9cc3`, `757276e`, `c6ba2f0`, backend `32835a3`, backend `45a3075`, backend `6d8ad08`). GPS is removed losslessly before upload (Exif in JPEG, TIFF and PNG; XMP packets with GPS are dropped from JPEG). The server strips it again from JPEG, and refuses HEIC. Capture time and make/model are kept. **Left:** Photos uploaded before the fix keep their GPS on Discord, Imgur and temp storage, and need a re-host backfill. XMP GPS inside TIFF and PNG, and non-JPEG files posted straight to the API, are not stripped.

**Where:** `src/app/core/upload/image-compression.service.ts:19`, `src/app/core/upload/image-compression.service.ts:51`, `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:78`, `rosak_backend/common/views.py:73`

**Problem.** Phone photos normally embed GPS position, capture time and device model. Every uploaded photo is therefore stored with that data, and the 'Submit anonymously' checkbox does not remove it. Canvas re-encoding would have stripped it for free, but the compressor re-attaches the original APP1 segment on purpose. For an audience that photographs trains from stations and homes, this is a real privacy exposure.

**Recommendation.** Strip GPS (and device/serial) tags on the client and server but keep or separately send the capture timestamp, or move the timestamp into upload metadata before dropping EXIF. Add the GPS-APP1 spec as proposed.

_Original suggestion (corrected by the verifier):_ Strip metadata for every photo on the client: always decode with createImageBitmap(file, { imageOrientation: 'from-image' }), draw to a canvas or OffscreenCanvas and call toBlob, and delete copyExif and retrieveExif entirely. Also strip on the server (Pillow ImageOps.exif_transpose followed by save without exif) so old clients and direct API callers are covered. Add specs that feed a JPEG containing a GPS APP1 segment and assert the output has none.

**Verification.** copyExif/retrieveExif deliberately re-attach the APP1 block, and the backend (common/tasks.py) forwards the file with EXIF to a Discord webhook without stripping, so GPS leaks. But the backend also reads EXIF DateTime to fill CalendarIncidentMedia.timestamp and posts EXIF fields to Discord, so blanket stripping would silently break that.

**Second check (high-severity pass).** code review: partially (medium). The core claim holds with one correction to the mechanism. photo-picker.component.ts sets toCompress: file.size > MAX_BYTES (9e6), so photos under 9 MB are uploaded untouched, as the original File, and image-upload.service.ts appends file.file to FormData. For those photos EXIF, including GPS, is sent whether or not the compressor exists. For photos over 9 MB, image-compression.service.ts resizeToSize calls copyExif, which deliberately re-inserts the original APP1 segment into the canvas output. The backend does not strip anything. common/tasks.py reads EXIF with Pillow only for logging, for Discord embed fields and for a timestamp, then re-uploads the raw file bytes to the Discord webhook. So the privacy exposure is real, but removing copyExif alone fixes only the rare large-photo case. Whether a viewer can read the GPS depends on whether Discord's CDN keeps EXIF, which I could not check. One more constraint: CalendarIncidentMedia.timestamp is taken from the EXIF DateTime of the uploaded file, so blanket stripping on the client or the server would break that timestamp for incident photos. impact review: partially (medium). The claim is true that GPS and device EXIF stay in uploaded photos and that image-compression.service.ts deliberately copies the APP1 segment back. But the compressor only runs for files over 9 MB (MAX_BYTES = 9e6), and most phone photos are smaller, so they are never re-encoded at all. Deleting copyExif therefore fixes only the rare large-file case, and the real exposure needs a server-side strip. The backend also reads EXIF in common/tasks.py and posts it to the moderation Discord webhook, so stripping on the client would remove that moderator information. Whether the files are publicly readable is not shown in the finding, so I rate the harm medium, not high.

**Fix note from the second check.** Strip GPS on the server in common/tasks.py before the Discord upload. Open the file with Pillow, read DateTime first for the timestamp, then drop the GPS IFD (exif.pop(0x8825)) or re-save without exif, and upload those bytes. The server step covers all clients and every photo size. Keep or move the client-side copyExif only if the timestamp is still needed, and add a spec for a JPEG that carries a GPS APP1 segment. Strip GPS and serial tags on the server (Pillow exif_transpose, then save without exif, or delete only the GPSInfo IFD) after the moderation EXIF read in common/tasks.py. If client stripping is wanted, always re-encode through a canvas rather than just deleting copyExif, and tell moderators that EXIF will be missing. Add a spec with a GPS APP1 JPEG.

**Also reported as:** [F258](security-privacy-and-platform-hardening.md#f044) [security] Original photo EXIF (including GPS) is deliberately preserved and uploaded to a public gallery (src/app/core/upload/image-compression.service.ts:19, src/app/core/upload/image-compression.service.ts:51)

<details><summary>Evidence</summary>

```text
/** Preserves the original JPEG's EXIF (APP1) segment, since canvas re-encoding drops it. */
...
const exif = await this.retrieveExif(src);
return new File([dest.slice(0, 2), exif, dest.slice(2)], src.name, { type: "image/jpeg" });
Photos under 9 MB are never re-encoded (`toCompress: file.size > MAX_BYTES`). A repo-wide search of rosak_backend for exif/ImageOps found no stripping step; GenericUpload stores the file as received.
```

</details>

<a id="f216"></a>

#### F216 · Stop the line pulse counting moderated links, and stop unapproved official posts raising 'Official update'

**medium** · effort M · security · gap-1

**Where:** `rosak_backend/incident/services/line_status.py:load_line_pulses`, `rosak_backend/incident/services/social_link_visibility.py:33-40`, `src/app/features/home/data/status-confidence.util.ts:19-24`, `src/app/core/methodology/methodology.content.ts:483`

**Problem.** The public feed hides moderated links, but the pulse used for the board's status, report counts, confidence chip, history buckets and 'Official update' never applies that rule. A spam or false link that an admin hides keeps driving 'Delayed', the Confirmed count and the heat grid until its reports age out. An ingested operator post that is still pending approval is not public, yet its isAutomated flag arrives in pulseLinks and makes the chip say the operator has published an update. The registry's moderation section is also still a placeholder, so none of this is stated. This lives in the backend, but it is a published-claim mismatch.

**Recommendation.** In load_line_pulses and _service_day_entries, exclude reports whose link is HIDDEN or an unapproved automated capture (reuse the predicate in social_link_visibility), and filter pulse links with the same predicate. Add a backend test, then say in the moderation section that hidden links do not count.

**Verification.** load_line_pulses filters LineStatusReport only by line and window, with no HIDDEN or pending-approval exclusion on the linked entry. I did not trace the link visibility rules further, but the pulse query itself has no moderation filter.

<details><summary>Evidence</summary>

```text
reports = [report async for report in LineStatusReport.objects.filter(line_id__in=line_ids, created__gte=now - window).select_related("link").order_by("-created")]
# no exclusion of link.status == HIDDEN or of is_automated + PENDING_APPROVAL
// registry: "The operator itself has published an update for this line"
```

</details>

<a id="f247"></a>

#### F247 · Give SSR a hard per-request deadline and fall back to the client shell when the backend is slow

**medium** · effort M · reliability · platform · partially confirmed · severity adjusted from high

**Where:** `src/server.ts:94`, `src/server.ts:113`, `apphosting.yaml:13`, `src/app/app.config.ts:163`

**Problem.** Angular SSR waits for every pending HttpClient call before it serialises the page, and neither the Express handler nor the GraphQL client has a timeout. When the Django backend is slow or hung, each SSR request is held open for the whole upstream timeout (60 s behind nginx). With concurrency 20 and maxInstances 4, only 80 hung renders are enough to exhaust the service, and that also takes down pages that need no backend data (the CSR shells, static assets are unaffected but every SSR route is). The site then looks fully down, not merely degraded.

**Recommendation.** Add a per-request render deadline with a CSR-shell fallback, and a server-side timeout on the GraphQL HttpClient. Tune the numbers from measured production latency.

_Original suggestion (corrected by the verifier):_ Race the render against a deadline in server.ts, for example 8 s: `const timeout = new Promise<null>(r => setTimeout(() => r(null), 8000)); const response = await Promise.race([angularApp.handle(req), timeout]);` and on timeout serve the prebuilt `index.csr.html` (readFile once at boot) with status 200 and `Cache-Control: no-store` so the browser fetches the data itself. Also add a server-only HttpInterceptorFn (registered in app.config.server.ts) that applies an AbortSignal.timeout of about 5 s to GraphQL requests, so a slow backend produces an error state quickly instead of pinning the instance.

**Verification.** server.ts has no render deadline and the handler is exactly as quoted. The 79 s figure was measured while a local backend was returning 504, and Cloud Run has its own request timeout, so the 'site looks fully down' framing is overstated.

<details><summary>Evidence</summary>

```text
app.use((req, res, next) => { angularApp.handle(req).then(...)  -- no timer, no AbortSignal. grep for timeout/AbortSignal.timeout in src/app/core/graphql and src/app/core/http: no matches. Measured: first GET / on a freshly started local server took 79.26 s while the Docker backend was returning 'nginx 504 Gateway Time-out' (see scratchpad/server.log); a later warm GET / took 4.4 to 4.8 s.
```

</details>

<a id="f250"></a>

#### F250 · Replace the generic, all-'Not adhered' GDPR checklist with a real privacy notice that matches actual data processing

**medium** · effort M · security · profile-about-misc · partially confirmed · severity adjusted from high

**Where:** `src/app/features/gdpr/gdpr.page.html:93-128`, `src/app/features/gdpr/data/gdpr.model.ts:1-21`, `src/app/features/about/about.page.html:97-112`, `src/main.ts:39-51`, `src/app/core/analytics/analytics.service.ts:41-47`, `src/index.html:40-44`

**Problem.** The page is copied boilerplate from gdpr.eu's compliance checklist, last edited in September 2022, and it publicly states in red badges that the site does not meet any of 19 GDPR obligations (including 'have a privacy policy', 'easy to request deletion', 'appoint a DPO'). It tells a visitor nothing about what MLPTF really does. The real processing is: Google sign-in via Firebase Auth (name, email, photo, optional phone), spotting history and photo uploads, Firebase Analytics page_view events, Sentry error and performance tracing plus Session Replay (10% of sessions, 100% of sessions with an error), reCAPTCHA, AdSense ads (third-party cookies), and on the 404 page requests to thecatapi.com and dog.ceo. None of this, nor retention, controller identity, a contact address or how to delete an account, is stated. It also contradicts the About page, which lists a 'Data Protection Officer' on the team. This is a legal-exposure and AdSense policy risk (AdSense requires an accurate privacy policy), and it is the page the footer labels 'GDPR'.

**Recommendation.** Rewrite the Firestore document (or move to static page content) as a short privacy notice: who the controller is and how to contact them, a table of processors (Firebase/Google, Sentry, Google AdSense, reCAPTCHA, cat and dog image APIs) with purpose, data and retention, the user's rights and the actual route to exercise them, and how analytics and replay can be turned off. Drop the per-item 'Not adhered' badges (or only show items that are genuinely tracked). Rename the footer link to 'Privacy'. Keep the CMS shape if you like, but change the content, not just the styling.

**Verification.** The template does render 'Adhered'/'Not adhered' badges from Firestore data, and no privacy notice for Sentry replay, AdSense or cat/dog APIs exists in code. I could not verify the live doc content or the About 'DPO' claim from the repo (those live in Firestore). The direction is right but the legal framing is somewhat overstated.

<details><summary>Evidence</summary>

```text
Live Firestore doc projects/rosak-7223b/.../public/gdpr (updateTime 2022-09-11): all 19 children have "adhered":{"booleanValue":false}, e.g. title "Provide clear information about your data processing and legal justification in your privacy policy." Page template: [variant]="child.adhered ? 'success' : 'destructive'" {{ child.adhered ? "Adhered" : "Not adhered" }}. The intro says: 'We aim to adhere to the GDPR ... contact us via the socials at the about page.'
```

</details>

<a id="f255"></a>

#### F255 · Add a security-header middleware to the Express SSR server (CSP, HSTS, nosniff, frame-ancestors, Referrer-Policy, Permissions-Policy)

**medium** · effort M · security · security · partially confirmed · severity adjusted from high

**Where:** `src/server.ts:28`, `src/server.ts:83`, `src/server.ts:104`, `firebase.json:9`

**Problem.** No page is served with a Content-Security-Policy, X-Content-Type-Options, X-Frame-Options or frame-ancestors, Referrer-Policy or Permissions-Policy, and no HSTS is set by the app. The app renders markdown HTML from community content, loads third-party scripts (AdSense, GA, reCAPTCHA, Mapbox) and holds a Firebase session in the page, so a CSP is the main defence-in-depth layer if any sanitiser gap appears. Without frame-ancestors the site can be framed for click-jacking, including the admin console. Express also advertises itself through X-Powered-By.

**Recommendation.** Disable x-powered-by and add nosniff, Referrer-Policy and frame-ancestors now. Trial the full CSP in Report-Only with autoCsp. Check what App Hosting already sends (HSTS) before adding it.

_Original suggestion (corrected by the verifier):_ Add a small middleware before express.static: app.disable('x-powered-by'); then set X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: camera=(), microphone=(), geolocation=(self) (the spotting form uses GPS), Strict-Transport-Security: max-age=31536000, and Content-Security-Policy with frame-ancestors 'none' (or 'self'). Start the full script CSP in Content-Security-Policy-Report-Only because it has to allow the AdSense, GA, Mapbox, reCAPTCHA, Sentry and google.com/s2/favicons origins and the inline pre-paint theme script in src/index.html (needs a hash or nonce). Angular's build option security.autoCsp can generate hashes for the inline scripts. Use the 'helmet' package only if you want to avoid hand-rolling the header values.

**Verification.** server.ts has no security headers, no x-powered-by disable, and firebase.json/apphosting.yaml set none, so the evidence holds. This is defence-in-depth with no known exploit, and Google's front end may add HSTS itself. A CSP also needs the inline theme script handled.

**Also reported as:** [F558](security-privacy-and-platform-hardening.md#f255) [platform] Add security headers (CSP report-only, nosniff, frame-ancestors, referrer policy) and drop X-Powered-By (src/server.ts:28, src/index.html:40)

<details><summary>Evidence</summary>

```text
curl -sI http://localhost:4321/ returned only: X-Powered-By: Express, content-type, Date, Connection, Keep-Alive. server.ts has no helmet, no res.setHeader of any security header, and no app.disable('x-powered-by'); firebase.json has no headers block for App Hosting.
```

</details>

<a id="f256"></a>

#### F256 · AI extract endpoint fetches any user-supplied URL server-side (SSRF, no size cap, error echo)

**medium** · effort M · security · security · partially confirmed · severity adjusted from high

**Where:** `functions/src/api.ts:241`, `functions/src/api.ts:263`, `functions/src/api.ts:266`, `functions/src/utils/pageContentFetcher.ts:27`, `functions/src/utils/pageContentFetcher.ts:40`, `functions/src/api.ts:329`

**Problem.** The only check on the URL is the scheme. Any signed-in user (a Google login is enough) can make the Cloud Function request private or internal addresses (127.0.0.1, 10.x, 169.254.x, metadata.google.internal, other VPC services) and follow redirects to them. Page text up to 10,000 characters is then summarised by Gemini and returned to the caller, and the 502 message echoes the raw Node error (ECONNREFUSED, ENOTFOUND, status codes), which works as a port and host scanner. response.text() has no size limit, so a multi-gigabyte response can exhaust the 256 MB function. The rate limit (20/hour) is checked and incremented non-atomically in rateLimit(), and `cors({ origin: true })` reflects any origin. The page content is also pasted straight into the Gemini prompt, so a hostile page can steer the extracted title, content and source_url shown to the submitter.

**Recommendation.** Add DNS/IP range checks on each redirect hop, a body size cap and a generic client error. Make the rate limit transactional and restrict CORS.

_Original suggestion (corrected by the verifier):_ Before fetching, resolve the hostname with dns.lookup (all addresses) and reject loopback, link-local, private and metadata ranges; repeat the check on every redirect by using redirect: 'manual' and a bounded loop of 3 hops. Allow only ports 80 and 443. Stream the body and abort after about 1 MB. Return a generic 'Cannot fetch URL' to the client and keep the detail in functions.logger. Make the rate limit a Firestore transaction (or increment first, then check). Restrict cors to the real web origins. Treat the fetched text as untrusted in the prompt (delimit it and tell the model to ignore instructions inside it).

**Verification.** handleExtract checks only the URL scheme, the fetcher follows redirects with no size cap, and the error text is echoed to the client. verifyAuth gates it and the metadata server needs a Metadata-Flavor header, so the exposure is narrower than stated. The non-atomic rate limit is real but minor.

**Also reported as:** [F249](security-privacy-and-platform-hardening.md#f256) [platform] Constrain the incident-extraction URL fetcher (SSRF surface, unbounded body) and make the rate limit atomic (functions/src/utils/pageContentFetcher.ts:28, functions/src/utils/pageContentFetcher.ts:32); [F548](security-privacy-and-platform-hardening.md#f256) [insiden-data] Harden the extract endpoint: block private and internal targets, cap the response size, and return typed errors (functions/src/api.ts:243, functions/src/api.ts:263)

<details><summary>Evidence</summary>

```text
if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") { throw new ValidationError(...) }
...
throw new UnavailableError(`Cannot fetch URL: ${toErrorMessage(error)}`);
// pageContentFetcher.ts
const response = await fetch(url, { ... redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
const html = await response.text();
```

</details>

<a id="f257"></a>

#### F257 · No consent gate or privacy notice for Analytics, AdSense and Sentry Replay; the GDPR page shows every item as 'Not adhered'

**medium** · effort M · security · security · partially confirmed · severity adjusted from high

**Where:** `src/index.html:42`, `src/app/core/analytics/analytics.service.ts:44`, `src/app/core/analytics/analytics.service.ts:50`, `src/main.ts:36`, `src/app/features/gdpr/gdpr.page.html:34`

**Problem.** For every visitor in production, Firebase Analytics starts, the AdSense loader runs from the static HTML (so ads can set cookies and profile the user before any choice), and Sentry records 10% of sessions plus every error session. Nothing asks for consent, and a search of src for consent, cookie or personalised-ads handling finds no such mechanism. Malaysia's PDPA requires notice and consent for processing personal data, and Google's EU User Consent Policy requires a CMP for EEA/UK traffic served ads. The only privacy page, /gdpr, is a copy of a generic checklist where every item is marked 'Not adhered' and the intro says 'We aim to adhere'; it names no controller, data categories, retention, third parties or contact route. Analytics also receives page_path with the full Firebase uid on /profile/<uid> routes, and Sentry replay is on although the app collects photos, GPS coordinates and profile text.

**Recommendation.** Add a consent banner gating Analytics, AdSense and Sentry replay, and write a real privacy page. Verify the uid in page_path before claiming it.

_Original suggestion (corrected by the verifier):_ Add a first-visit consent banner (or Google's certified CMP) with accept, reject and a footer 'Privacy settings' link. Until the visitor accepts: do not call getAnalytics()/setAnalyticsCollectionEnabled(true), do not add the adsbygoogle script (inject it from afterNextRender after consent, or set `(adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1` for a non-personalised fallback), and do not add Sentry.replayIntegration(). Store the choice in localStorage with try/catch. Write a real /privacy page (controller, data collected, processors such as Google, Sentry, Mapbox and the Discord media relay, retention, how to request deletion) and replace the checklist-only /gdpr content. Strip the uid from tracked paths (send the route template '/profile/:id'). Deferring Analytics also removes about 12 KB plus Installations code from the initial bundle.

**Verification.** analytics.service.ts:50 enables collection with no consent input, and the AdSense script is in static HTML. No consent code exists in src. Severity depends on legal exposure, and the uid-in-page_path claim was not checked.

**Also reported as:** [F041](security-privacy-and-platform-hardening.md#f257) [profile-about-misc] Add a consent mechanism before Analytics, Session Replay and AdSense start (src/main.ts:12-51, src/app/core/analytics/analytics.service.ts:41-52); [F200](security-privacy-and-platform-hardening.md#f257) [core-shell] No consent step before Google Analytics and AdSense start collecting (src/app/core/analytics/analytics.service.ts:50, src/index.html:42)

<details><summary>Evidence</summary>

```text
setAnalyticsCollectionEnabled(this.analytics, environment.production);   // no consent input
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3632544969292535" crossorigin="anonymous"></script>
replaysSessionSampleRate: 0.1, replaysOnErrorSampleRate: 1.0,
Firestore public/gdpr: all 20 checklist items have "adhered": false (including 'Provide clear information about your data processing ... in your privacy policy').
```

</details>

<a id="f305"></a>

#### F305 · Console routes are guarded leaf by leaf; add canActivateChild/canMatch on the console parent

**low** · effort S · security · console · partially confirmed

**Where:** `src/app/app.routes.ts:76`, `src/app/features/console/console.routes.ts:19`, `src/app/features/console/console.routes.ts:25`, `src/app/core/auth/admin-only.guard.ts:11`

**Problem.** All three current pages are guarded, and the two redirects land on guarded targets, so there is no hole today. But the guard is repeated per leaf and the parent route has none, so a fourth console page added without the line would be open (backend still enforces admin, so the harm is limited to exposing the UI and its lazy chunk). Non-admins also download the console route chunks before the guard runs, and a signed-out visitor is redirected to /spotting with no sign-in prompt or explanation.

**Recommendation.** Use canActivateChild on the console parent instead of canMatch.

_Original suggestion (corrected by the verifier):_ Put `canMatch: [adminOnlyGuard]` (prevents loading the chunk and falls through to the not-found page) or `canActivateChild: [adminOnlyGuard]` on the `console` route in app.routes.ts, and keep a routes spec asserting that every child route is covered. Optionally redirect to the sign-in flow with a returnUrl for signed-out users.

**Verification.** All three leaves carry adminOnlyGuard, and the redirects are covered, as the finding itself admits. A parent canActivateChild is a reasonable hardening, but canMatch could hide the page behind not-found before auth is ready.

<details><summary>Evidence</summary>

```text
app.routes.ts:76-79: { path: "console", title: "MLPTF | Console", loadChildren: () => import("./features/console/console.routes").then((m) => m.CONSOLE_ROUTES) },
console.routes.ts: canActivate: [adminOnlyGuard] repeated on each of 3 leaves
```

</details>

<a id="f310"></a>

#### F310 · Auto ads script also loads on the admin console

**low** · effort S · security · console · partially confirmed

**Where:** `src/index.html:42`

**Problem.** The AdSense loader is unconditional in index.html, so it runs on /console as well. Whether Auto ads actually render there depends on the AdSense dashboard, which I could not check. If they do, ad overlays or vignettes can appear over a moderation UI, risk misclicks on Approve/Reject, and expose the account to invalid-click flags from an admin who works in the console daily.

**Recommendation.** Check the AdSense dashboard and add a /console URL exclusion there.

_Original suggestion (corrected by the verifier):_ Exclude `/console/*` in the AdSense Auto ads URL exclusions, or load the script from a small service after routing only when the URL is not under `/console`. Confirm in the dashboard what is served today.

**Verification.** index.html loads the AdSense script unconditionally. The comment there says Auto ads depend on dashboard settings outside the codebase, and the finding admits it cannot confirm ads render on /console. Excluding the path in the dashboard is the right fix.

<details><summary>Evidence</summary>

```text
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3632544969292535" crossorigin="anonymous"></script>
```

</details>

<a id="f322"></a>

#### F322 · Pull request builds create Sentry releases and upload source maps

**low** · effort S · security · deps-tooling

**Where:** `.github/workflows/ci.yml:80-86`, `scripts/sentry-sourcemaps.mjs:37-52`

**Problem.** Every pull request build with the secret present creates and finalizes a Sentry release and uploads its source maps. This clutters release history with branch builds and gives PR code a path into the production Sentry project. The script itself soft-fails correctly without a token, so the risk exists only where the secret is present in CI.

**Recommendation.** Gate the upload step on the event: run postbuild only for pushes to main or staging, or pass a separate environment flag from ci.yml that the script checks before releasing. Keep the upload for deploy builds.

**Verification.** ci.yml build runs on pull_request with SENTRY_AUTH_TOKEN passed from secrets, and scripts/sentry-sourcemaps.mjs runs sentry-cli releases new for the short commit hash whenever a token is present, with no event check. The same-repo PR path is the only one where the secret is exposed, so low severity is right.

<details><summary>Evidence</summary>

```text
ci.yml build job: "env:\n  SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}" and the job runs on pull_request. sentry-sourcemaps.mjs: "sentryCli([\"releases\", ..., \"new\", release]);" creates a release named by the short commit hash each time the build runs.
```

</details>

<a id="f368"></a>

#### F368 · Replace the Google favicon service for pulse links with a first-party icon

**low** · effort S · security · home-data · partially confirmed

**Where:** `src/app/features/home/line-pulse/line-pulse-card.component.ts:195`, `src/app/features/home/line-pulse/line-pulse-card.component.ts:197`

**Problem.** Every community-submitted link on a Needs-attention card makes the visitor's browser call google.com with the link's domain and the visitor's IP on each render, and the app has a GDPR page and Firebase Analytics already. It adds one third-party request per link, no width, loading or referrerpolicy attributes.

**Recommendation.** Add loading="lazy" decoding="async" referrerpolicy="no-referrer" via the shared favicon helper; skip a first-party icon.

_Original suggestion (corrected by the verifier):_ Draw a neutral link icon, or have the backend store a favicon at submission time. If the service stays, add referrerpolicy="no-referrer", loading="lazy", decoding="async", explicit width/height and mention it on the GDPR page.

**Verification.** The Google favicon img exists at line-pulse-card:197 but is used app-wide (link-card, social-link.util), and the app already ships AdSense and Analytics, so the privacy argument is weak. Adding loading=lazy and referrerpolicy is cheap polish.

**Also reported as:** [F392](security-privacy-and-platform-hardening.md#f368) [insiden-ui] Link favicons are fetched from Google per row, without lazy loading, and leak every submitted domain (src/app/features/insiden/link-card/link-card.component.ts:112-116, src/app/features/insiden/data/incident-link-line.util.ts:70)

<details><summary>Evidence</summary>

```text
[src]="'https://www.google.com/s2/favicons?domain=' + domain"
```

</details>

<a id="f370"></a>

#### F370 · Neutralise spreadsheet formulas and add a BOM in the shared CSV helper

**low** · effort S · security · home-data · partially confirmed

**Where:** `src/app/core/export/csv.util.ts:35`, `src/app/core/export/csv.util.ts:92`, `src/app/features/home/pro/pro-lines-widget.component.ts:304`

**Problem.** toField quotes but does not neutralise cells starting with =, +, -, @, tab or carriage return, and the Blob has no UTF-8 byte order mark. Today the Pro export only contains admin-owned line names and numbers, so it is not exploitable, but the helper is shared and the next export (links, notes, reporter names) will carry community text into Excel. Excel also misreads non-ASCII text without a BOM.

**Recommendation.** Neutralise only string cells starting with =,+,-,@ (never typed number cells) when a text-carrying export is added; the BOM is optional.

_Original suggestion (corrected by the verifier):_ In toField prefix risky leading characters with an apostrophe (or a space) and prepend ﻿ to the Blob; add spec cases for '=1+1', '@x' and a Malay accented name.

**Verification.** toField only quotes and downloadCsv adds no BOM, so formula-leading text would pass through. Today only admin-owned line names and numbers are exported, so this is speculative hardening.

<details><summary>Evidence</summary>

```text
const NEEDS_QUOTING = /["\r\n,]/;
...
const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
```

</details>

<a id="f378"></a>

#### F378 · The submit box passes non-http(s) schemes through to a public, immediately-LIVE feed

**low** · effort S · security · home-ui

**Where:** `src/app/features/home/feed/feed-url.util.ts:30`, `src/app/features/home/feed/link-submit-box.component.ts:201`, `../rosak_backend/incident/services/urls.py:75`, `../rosak_backend/incident/services/feed_links.py:195`

**Problem.** Any logged-in user can publish a link such as `data:text/html,...` or `file:///etc/passwd` straight onto the front page. Angular sanitises `[href]` into an inert `unsafe:` URL, so this is not script execution, and the server-side title fetch is correctly restricted to public http(s) hosts, but the result is a dead or odd link visible to everybody, with no moderation step in between. The client deliberately keeps other schemes, so the reader gets no hint that the link is not acceptable.

**Recommendation.** Validate on both sides. In the schema add a custom validator that fails with 'Links must start with http:// or https://' when `new URL(normalizeFeedUrl(value)).protocol` is not http: or https: (catch the URL parse error as invalid), and make the backend reject non-http(s) in submit_feed_link. Extend feed-url.util.spec.ts with javascript:, data: and ftp: cases.

**Verification.** normalizeFeedUrl leaves non-dotted schemes untouched, canonicalize_url returns raw for non-http(s), and submit_feed_link stores it LIVE with no scheme check (only the title fetch is gated). Angular sanitises the href so impact is a dead/odd public link.

<details><summary>Evidence</summary>

```text
feed-url.util.ts:30  return scheme && !scheme.includes(".") ? trimmed : `https://${trimmed}`;   (javascript:, data:, file:, ftp: are left as typed)
urls.py: canonicalize_url returns the input unchanged "when it uses a non-http(s) scheme"; feed_links.py:195 status=SocialMediaLinkStatus.LIVE
```

</details>

<a id="f400"></a>

#### F400 · Make Angular SSR host validation explicit instead of relying on an undocumented platform env var

**low** · effort S · reliability · platform · partially confirmed · severity adjusted from medium

**Where:** `angular.json:31`, `apphosting.yaml:17`, `AGENTS.md:17`

**Problem.** With an empty allowedHosts list the SSR engine rejects every host, so production only works if the App Hosting platform injects NG_ALLOWED_HOSTS (or equivalent). Nothing in the repo states or asserts that. A platform change, a new custom domain or the staging backend on a new hostname would turn into a site-wide 400 with no repo change to blame. It also means the documented `npm run serve:ssr:web` command is broken locally.

**Recommendation.** Document NG_ALLOWED_HOSTS for local serve:ssr:web. Confirm with the maintainer how production gets its value before changing angular.json.

_Original suggestion (corrected by the verifier):_ Make it explicit. Either list the real hosts in angular.json (`"allowedHosts": ["community.mlptf.org.my", "*.hosted.app", "*.web.app", "localhost"]`, using the actual domains), or declare `NG_ALLOWED_HOSTS` as a RUNTIME variable in apphosting.yaml and apphosting.staging.yaml. Add one sentence to AGENTS.md next to serve:ssr:web saying to run it as `NG_ALLOWED_HOSTS=localhost,127.0.0.1 npm run serve:ssr:web`. Please confirm with the maintainer how production gets its value today.

**Verification.** angular.json has allowedHosts: [] as quoted, and no repo doc mentions NG_ALLOWED_HOSTS. App Hosting is a managed platform that likely injects the variable, since production works, so this is a documentation and local-dev gap, not a production risk.

<details><summary>Evidence</summary>

```text
"security": { "allowedHosts": [] }  Measured: `PORT=4398 node dist/web/server/server.mjs` without NG_ALLOWED_HOSTS answers every request with 400 'Header "host" with value "localhost:4398" is not allowed.' and a Host of 127.0.0.1:4398 is also rejected; a forged `Host: evil.example.com` against the instance started with NG_ALLOWED_HOSTS=localhost,127.0.0.1 also gets 400. grep for NG_ALLOWED_HOSTS across AGENTS.md, README.md, docs and MISTAKES.md: no hits.
```

</details>

<a id="f402"></a>

#### F402 · Hidden source maps are publicly downloadable from the app origin

**low** · effort S · security · platform · partially confirmed

**Where:** `angular.json:53`, `src/server.ts:83`, `scripts/sentry-sourcemaps.mjs:2`

**Problem.** Hidden only means the comment is absent; express.static serves every .map file in dist/browser to anyone who guesses the name (main-<hash>.js.map is trivially derivable from the script tag). That exposes the full original TypeScript, including all the design comments and internal route and API knowledge, and the maps are also pulled into every App Hosting image. The rationale in the script comment does not hold for crawlers or curious users.

**Recommendation.** Optional: 404 .map requests in Express, or delete the maps after the Sentry upload.

_Original suggestion (corrected by the verifier):_ Block them in Express: `app.get(/\.map$/, (_req, res) => res.sendStatus(404));` placed before express.static. Keep them on disk so Sentry upload and Node's --enable-source-maps still work, or delete dist/web/browser/**/*.map at the end of sentry-sourcemaps.mjs once the upload succeeded.

**Verification.** Hidden maps are served by express.static, as the finding says. Shipping source maps for an open-source-style community app is low-impact, and blocking them is a trivial change.

<details><summary>Evidence</summary>

```text
"sourceMap": { "scripts": true, "hidden": true }  Measured: curl http://localhost:4321/main-PHLJPND6.js.map -> HTTP 200, 1,885,860 bytes, Cache-Control: public, max-age=31536000. The script comment says the maps 'ship with no sourceMappingURL comment, so a real visitor's devtools never sees or fetches one'.
```

</details>

<a id="f406"></a>

#### F406 · Harden /api/gtfs-proxy: add a timeout, size cap, caching headers and stop buffering whole zips

**low** · effort S · reliability · platform · severity adjusted from medium

**Where:** `src/server.ts:43`, `src/server.ts:63`, `src/server.ts:68`, `src/server.ts:76`

**Problem.** The host allow-list is exact and correctly rejects api.data.gov.my.evil.com, which is good. But the fetch has no AbortSignal, so a stalled upstream holds a worker slot indefinitely; the whole GTFS-static zip is buffered in a 512 MiB process (prasarana bus feeds are large) with no size cap; and the response has no Cache-Control, so every tracker visit re-downloads the daily-changing feed through the app server and anyone can drive that traffic with a loop. The raw error message is also echoed back to the client.

**Recommendation.** Use `fetch(parsed, { signal: AbortSignal.timeout(15000), redirect: 'follow' })`, reject when content-length exceeds a cap (for example 50 MB), set `Cache-Control: public, max-age=3600, s-maxage=21600` so the CDN absorbs repeats, pass the body through with `Readable.fromWeb(upstream.body).pipe(res)` instead of buffering, and reply with a fixed 'Upstream fetch failed' message while sending the real error to Sentry only. Extract the URL validation into a pure function in its own file and add a Vitest spec, like server-cache-control.ts has.

**Verification.** The gtfs-proxy fetch has no signal, buffers the whole body via arrayBuffer, sets no Cache-Control, and echoes err.message back to the client. The host allow-list itself is fine. The hardening items are real but contained.

**Also reported as:** [F398](security-privacy-and-platform-hardening.md#f406) [performance] Stream the GTFS proxy and give it cache headers: it buffers whole zips in memory on every request (src/server.ts:62, src/server.ts:68); [F427](security-privacy-and-platform-hardening.md#f406) [security] Pre-allowed hosts and open GTFS proxy: unauthenticated, uncapped, uncached download amplifier on the SSR instances (src/server.ts:43, src/server.ts:63); [F277](security-privacy-and-platform-hardening.md#f406) [tracker-gallery] Cache and bound the GTFS-static proxy, and ship only stops.txt to the browser (src/server.ts:63, src/server.ts:73)

<details><summary>Evidence</summary>

```text
const upstream = await fetch(parsed);  const buffer = Buffer.from(await upstream.arrayBuffer());  res.send(buffer);  ...  res.status(502).send(`Proxy fetch failed: ${err instanceof Error ? err.message : String(err)}`);  Measured response for the ktmb static feed: Content-Type: binary/octet-stream, ETag only, no Cache-Control, 46,215 bytes.
```

</details>

<a id="f426"></a>

#### F426 · Stop shipping the **e2eAuthOverride** backdoor in production bundles

**low** · effort S · security · security

**Where:** `src/app/core/auth/auth.service.ts:72`, `src/app/core/auth/auth.service.ts:73`, `src/app/core/auth/auth.service.ts:23`

**Problem.** The override is present in the production main bundle (confirmed in the built output). Anyone who can run script before bootstrap (a browser extension, a DevTools override, or a self-XSS) can set isLoggedIn and isAdmin to true and so unlock the /console route (adminOnlyGuard reads auth.isAdmin()) and the About editor UI. This is UI exposure only: auth stays undefined, idToken() returns null, no Authorization or firebase-auth-key header is sent, and Firestore rules require users/{uid}.permissions.admin, so no real privilege is gained. The doc comment says 'Never set in production' but nothing enforces it. It is still avoidable attack surface, and it makes any future client-only admin check easier to bypass.

**Recommendation.** Gate on an e2e-only build-time flag or InjectionToken. Verify the e2e build actually uses a non-production configuration first.

_Original suggestion (corrected by the verifier):_ Gate the branch on a build-time constant, for example `if (!environment.production) { ...override... }` (the Playwright suite already runs a development-configuration build per playwright.config.ts, so e2e keeps working) or move it behind an InjectionToken provided only in the e2e build. The dead branch is then removed by the production optimiser.

**Verification.** auth.service.ts:72 reads globalThis.**e2eAuthOverride** unconditionally and the e2e helpers set it. It only flips UI signals, so this is low-impact polish.

**Also reported as:** [F312](security-privacy-and-platform-hardening.md#f426) [core-shell] Gate the **e2eAuthOverride** backdoor out of production builds (src/app/core/auth/auth.service.ts:72, src/app/core/auth/auth.service.ts:74); [F345](security-privacy-and-platform-hardening.md#f426) [gap-2] The e2e auth override ships in the production bundle and unlocks admin UI for anyone who sets one global before boot (src/app/core/auth/auth.service.ts:72, src/app/core/auth/admin-only.guard.ts:13); [F415](security-privacy-and-platform-hardening.md#f426) [platform] The E2E auth override ships in the production bundle and two ad hoc QA scripts duplicate fixtures (src/app/core/auth/auth.service.ts:72, e2e/helpers/auth.ts:10); [F441](security-privacy-and-platform-hardening.md#f426) [test-gaps] The E2E auth override is compiled into the production bundle and no test shows it is inert there (src/app/core/auth/auth.service.ts:70-78, e2e/helpers/auth.ts:4-13)

<details><summary>Evidence</summary>

```text
const override = (globalThis as { __e2eAuthOverride__?: E2EAuthOverride }).__e2eAuthOverride__;
if (override) {
  this.isLoggedIn.set(true);
  this.isAdmin.set(override.admin);
  this.resolveReady();
  return;
}   // and: grep -l __e2eAuthOverride__ in the production build wt/dist/web/browser matches main-PHLJPND6.js
```

</details>

<a id="f431"></a>

#### F431 · GDPR page injects Firestore HTML through [innerHTML] with no link hardening

**low** · effort S · security · security · partially confirmed

**Where:** `src/app/features/gdpr/gdpr.page.html:18`, `src/app/features/gdpr/gdpr.page.html:21`, `src/app/features/gdpr/gdpr.page.html:42`, `src/app/features/gdpr/gdpr.page.html:45`

**Problem.** Angular's built-in sanitiser strips scripts and event handlers, and the content is writable only by admins (verified in the live Firestore rules), so there is no practical XSS today. Remaining weaknesses: the stored HTML contains dozens of external <a> links (gdpr.eu, proton.me) with no rel or target control, and if the admin gate were ever weakened the page would become a persistent HTML injection point for a trusted-looking legal page. Also, every item currently says 'Not adhered' (see the consent finding), so the page's presentation undermines user trust more than the sanitiser question.

**Recommendation.** Keep the default sanitiser (do not add bypassSecurityTrust*). Post-process external anchors after render (afterNextRender: set rel='noopener noreferrer' and target='_blank' on links whose origin differs), or convert the content to a typed structure rendered by the template. Replace the generic checklist with a real privacy notice.

**Verification.** The innerHTML bindings exist and the default sanitiser applies, with admin-only writes. The real concern is only anchor rel hardening on admin-authored content, which is polish.

<details><summary>Evidence</summary>

```text
<p class="text-sm" [innerHTML]="definition()"></p>
...
<div class="text-muted-foreground mt-3 text-sm" [innerHTML]="child.details"></div>
```

</details>

<a id="f435"></a>

#### F435 · Staging is indexable because robots.txt is the only control

**low** · effort S · security · seo-pwa-i18n · partially confirmed · already documented

**Where:** `public/robots.txt:4-8`, `src/server.ts:94`, `src/environments/environment.ts:11`

**Problem.** robots.txt controls crawling but not indexing, and the staging backend is served from a public hosted domain. Any copy of the public pages on staging can be indexed and compete with production in search. The comment's rationale holds only while nobody links to staging, and a single shared link breaks it. The app already has the environment name at runtime, so no new configuration is needed.

**Recommendation.** Add the X-Robots-Tag: noindex, nofollow middleware before the express.static call in server.ts so that static files are covered too, gated on environmentName not being production. Keep robots.txt unchanged.

_Original suggestion (corrected by the verifier):_ In server.ts, before the Angular middleware, add an Express middleware that sets X-Robots-Tag: noindex, nofollow when environment.environmentName is not "production". This is a single small change that covers the HTML and the static files. Keep the robots.txt as it is.

**Verification.** robots.txt:4-8 has the comment about staging, and environment.ts:11 exposes environmentName, so the indexability risk is real but depends on staging being publicly reachable and linked. The proposed middleware sits before the Angular handler, but server.ts serves express.static before that, so static files would not get the header as the finding claims.

<details><summary>Evidence</summary>

```text
public/robots.txt:4-8 → "Staging hosts are not publicly linked; if they ever need to be excluded from indexing entirely, replace this file with an environment-aware SSR route keyed on ENVIRONMENT_NAME."
environment.ts:11 → environmentName: runtimeConfig.environmentName,
```

</details>

<a id="f462"></a>

#### F462 · reCAPTCHA badge is hidden app-wide but the required disclosure text is not displayed anywhere

**low** · effort S · security · ui-system

**Where:** `src/styles.css:171`, `src/styles.css:175`, `src/app/features/profile/my-spottings/my-spottings.component.ts:346`, `src/app/core/recaptcha/recaptcha.service.ts:30`

**Problem.** Google's terms allow hiding the badge only if the 'This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply' text is shown in the user flow. The comment's own TODO was never done, and the gated action now also lives on the user-facing profile page, not just the admin console.

**Recommendation.** Render the short disclosure text (with the two links) beneath the delete-spotting confirmation and in the console footer, or in the shared footer, and update the comment to list both call sites.

**Verification.** styles.css:171-175 hides .grecaptcha-badge with a comment that itself calls for disclosure text, and no 'protected by reCAPTCHA' string exists in src. my-spottings.component.ts:346 calls recaptcha.execute on the public profile page.

<details><summary>Evidence</summary>

```text
.grecaptcha-badge { visibility: hidden; }
comment: 'currently /console'; but my-spottings.component.ts:346 calls this.recaptcha.execute("deleteSpottingEntry") on the public profile page. rg -i 'protected by reCAPTCHA' src finds only the CSS comment.
```

</details>

<a id="f579"></a>

#### F579 · AdSense loader is a blocking-priority head script on every page with no consent step, and Auto ads can bypass the AdSlot caps

**low** · effort M · performance · ui-system · partially confirmed · severity adjusted from medium

**Where:** `src/index.html:40`, `src/index.html:31`, `src/app/ui/ad-slot/ad-slot.component.ts:98`, `src/app/core/ads/ads.config.ts:13`

**Problem.** The script is in index.html, so it loads on every route (including /console, /profile and CSR shells) whether or not the page contains an AdSlot, competing with hydration on slow phone connections and loading before any consent. If Auto ads is on in the AdSense dashboard, which the index.html comment assumes, Google can inject ads anywhere, bypassing the fixed-height CLS reservations and the 2-units-per-page cap that AdSlotComponent documents. Google requires a certified consent platform for EEA/UK visitors.

**Recommendation.** Wrap pushAd in try/catch and consider deferring the loader to idle; treat consent as optional.

_Original suggestion (corrected by the verifier):_ Remove the tag from index.html and inject it once from AdSlotComponent (a root-provided AdsLoader) inside afterNextRender after requestIdleCallback or first interaction, only when ADS_CONFIG.enabled, only on routes that render a slot, and only after a consent decision (Google Consent Mode v2 or a CMP). The existing window.adsbygoogle queue makes the push safe before the script arrives. Turn Auto ads off in the dashboard so only the manual units render. Also wrap pushAd() in try/catch, since adsbygoogle.push throws on a missing or already-filled <ins> and the error would otherwise reach Sentry.

**Verification.** index.html:40 loads adsbygoogle.js on every route, async, and ad-slot.component pushAd() has no try/catch. The audience is Malaysian, so the EEA consent argument is weak, and the Auto ads bypass depends on an unverified dashboard setting.

<details><summary>Evidence</summary>

```text
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3632544969292535" crossorigin="anonymous"></script>
Measured on / (mobile viewport, 10 s): pagead2.googlesyndication.com 3 requests, 259 KB; googleads.g.doubleclick.net 2 requests; plus googletagmanager 163 KB. rg for consent/cookie in src/ finds nothing. index.html comment: 'this is genuinely all a page needs for Auto ads to work'; AdSlotComponent doc: 'no more than 2 ad units per page'.
```

</details>
