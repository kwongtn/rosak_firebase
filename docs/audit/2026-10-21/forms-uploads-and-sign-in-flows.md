# Forms, uploads and sign-in flows

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 23 findings, most severe first.

Submit paths swallow errors, allow double submits, lose drafts and lose or retry photos forever. Compression, auth popups and the create-then-submit chain need hardening.

<a id="f009"></a>

#### F009 · Fix the Extract button so a successful extraction does not leave the chronology row permanently disabled

**high** · effort S · reliability · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.component.ts:400`, `src/app/features/insiden/incident-form/incident-form.component.ts:434`, `src/app/features/insiden/incident-form/incident-form.component.ts:498`, `src/app/features/console/insiden/pending/pending.component.ts:595`, `src/app/features/insiden/incident-form/incident-form.component.html:304`

**Problem.** extractChronology sets extracting:true before the call. It resets it to false only in the timeout handler, in the timed-out branch and in the catch block. On the happy path (response arrives inside 15 seconds, the common case) applyExtraction updates the chronology list but never clears the flag, and a null result (unauthenticated or server) also leaves it set. isExtracting(key) therefore stays true, so the template keeps the spinner and the Extracting label showing and keeps the indicator select, datetime, URL, textarea and Extract button disabled. The user cannot correct the extracted text and has to delete the row. The identical bug is copied into the console pending panel. No spec exercises extractChronology (the console spec states 'No extract/summarize test here'), which is how it survived.

**Recommendation.** Reset the state in a finally-style step: after the await, call setExtractState(key, { extracting: false, lateResult: null, preReplaceSnapshot: null, replaced: false }) before applying the result, but only when !timedOut and the key still exists. Better, move the whole extract state machine (extracting, timer, late result, undo) into one shared helper used by both the public form and the console panel, and add a spec that mocks IncidentAiService and asserts the row is editable again after success, after failure and after a late result.

**Verification.** Read extractChronology: extracting:true is set, and on the happy path only applyExtraction (a chronologies.update) runs, so the flag is never cleared; the template disables the select, datetime, URL and Extract button on isExtracting(). The same code is in console pending.component.ts, and no spec exercises it.

**Second check (high-severity pass).** code review: holds (high). In incident-form.component.ts extractChronology, setExtractState(key, {extracting:true}) runs first, and then `clearTimeout(timer)` runs after the await, which removes the only timeout path that resets the flag. On the success path the code only calls `applyExtraction(key, result.data)`. That method only updates `this.chronologies` via applyExtractionToChronology (extract-data.util.ts), which never touches extractStates. A null result also falls through without resetting. isExtracting(key) therefore stays true. The template binds [disabled]="isExtracting(chronology.key)" on the indicator select, datetime input, URL input, Extract button and the content textarea (lines 304-376), and it keeps the spinner showing. The same code is in console/insiden/pending/pending.component.ts around lines 560-605. Only the timeout, late-result and catch paths clear the flag. No spec covers extractChronology. The only exit is deleting the row (removeChronology deletes the state entry). The extracted text is already applied, but it cannot be corrected on that row afterwards. impact review: holds (high). In extractChronology, the happy path calls applyExtraction, which only updates chronologies, and never clears extracting. setExtractState(extracting:true) is reset only on timeout, late result and catch. The template disables the select, datetime, URL, textarea and Extract button on isExtracting(key) (lines 304-376), so after every successful extraction within 15 seconds the row stays locked with a spinner. The user cannot fix extracted text and must delete the row. This is a deterministic bug in the main success path of a feature, with no workaround other than deleting the row.

**Fix note from the second check.** Smallest fix: right after `clearTimeout(timer)` in the happy path, before `applyExtraction`, call `this.setExtractState(key, {extracting:false, lateResult:null, preReplaceSnapshot:null, replaced:false})`. Do this in both the incident form and the console pending panel. Add one spec asserting the row is editable after success. A shared state-machine helper is optional, not needed for the fix. In the success branch, before applyExtraction, call setExtractState(key, {extracting:false, lateResult:null, preReplaceSnapshot:null, replaced:false}); also do this when result is null. Apply the same one-line change in console/insiden/pending/pending.component.ts and add a spec.

<details><summary>Evidence</summary>

```text
this.setExtractState(key, { extracting: true, ... });
...
if (result) {
  this.applyExtraction(key, result.data);
}
// applyExtraction only does: this.chronologies.update(...)  -- extractStates is never reset to extracting:false on this path
```

</details>

<a id="f003"></a>

#### F003 · Network and server failures on the spotting, link and incident forms are re-thrown with no user-visible message

**medium** · effort S · ux · gap-2 · second check set severity high → medium

**Where:** `src/app/features/spotting/report-form/report-form.component.ts:333`, `src/app/features/insiden/link-form/link-form.component.ts:522`, `src/app/features/insiden/incident-form/incident-form.component.ts:682`, `src/app/features/home/line-status/line-status-sheet.component.ts:389`

**Problem.** Only GraphQLRequestError is turned into a toast (by GraphQLClient). An HttpErrorResponse (a tunnel drop, 502, 429, or the HTTP 500 the backend returns for an invalid ID token, which I reproduced with curl against /graphql/) is re-thrown straight to Sentry. The rider taps Submit, the button re-enables, and nothing says what happened; the draft stays but there is no hint to retry. The line-status sheet already does this correctly (inline role=alert message 'Couldn't reach the server. Check your connection...') but the three other forms did not copy it. This is the main journey for riders on trains with patchy data.

**Recommendation.** Copy the line-status-sheet pattern: set an inline submitError for the non-GraphQL branch and also toast it, then keep re-throwing for Sentry. Better, put this in one helper (see the central-auth finding) so all mutation sites share it, for example `describeSubmitError(err): string` that maps offline/401/403/5xx to specific copy ('You're offline', 'Your session expired, log in again').

**Verification.** report-form, link-form and incident-form catch blocks only handle GraphQLRequestError and re-throw anything else. There is no HTTP interceptor, and AppErrorHandler only reports to Sentry. Line-status-sheet does set an inline message, as the finding says. Submit failures on bad connections are silent.

**Second check (high-severity pass).** code review: holds (medium). All three forms (report-form line 333, link-form line 522, incident-form line 682) catch GraphQLRequestError and otherwise rethrow. Nothing else turns a transport error into UI. There is no HttpInterceptor anywhere in app.config.ts (only provideHttpClient()), and AppErrorHandler only forwards to Sentry. GraphQLClient.request() lets HttpErrorResponse propagate untouched and toasts only for GraphQL errors. So a 502, offline fetch, or 429 re-enables the Submit button and shows nothing. I reproduced the HTTP 500: curl with header 'firebase-auth-key: garbage' returned '500 text/html; charset=utf-8'. The line-status sheet (line 395) does set 'Couldn't reach the server...' inline, so the recommended pattern really exists. The finding lists line-status-sheet in its 'where' field, but that file is the correct example, not a defect. I rate it medium rather than high: the user can retry and the draft survives, but the silent failure hits the main rider flow on patchy data. impact review: holds (medium). The catch in report-form.component.ts only returns for GraphQLRequestError (which GraphQLClient already toasts) and otherwise rethrows. AppErrorHandler only forwards to Sentry and shows no toast. A dropped connection, 5xx or 429 on submit therefore gives the rider no message, the button just re-enables. This hits commuters on patchy data, but the draft is kept and a retry works, so the harm is a confusing silent failure and not data loss. High is slightly strong; medium fits.

**Fix note from the second check.** Smaller fix: in the three catch blocks, replace the bare rethrow with `this.toast.error("Couldn't submit", "Check your connection and try again."); throw err;`. Alternatively handle it once in GraphQLClient.request by catching HttpErrorResponse, toasting in the browser, and rethrowing, which also covers every other mutation site. No new helper module is needed. Drop line-status-sheet from the affected list. Add a small shared helper that, for non-GraphQL errors, calls toast.error with copy such as "Couldn't reach the server. Check your connection and try again." and then rethrows for Sentry. Use it in the three forms. The ToastService is already injected in these components, so no new inline error state is needed.

**Also reported as:** [F105](forms-uploads-and-sign-in-flows.md#f003) [insiden-data] Show an error when a submit fails for non-GraphQL reasons (offline, 5xx) and stop double-toasting GraphQL errors (src/app/features/insiden/incident-form/incident-form.component.ts:681, src/app/features/insiden/link-form/link-form.component.ts:521)

<details><summary>Evidence</summary>

```text
} catch (err) {
  if (err instanceof GraphQLRequestError) {
    return;
  }
  throw err;
} finally {
  this.isSubmitting.set(false);
}
// verified: a garbled Firebase token makes the backend answer HTTP 500 (InvalidIdTokenError, text/html), not a GraphQL error
```

</details>

<a id="f080"></a>

#### F080 · Spotting form keeps the previous line's station ids after the line changes, so a stale station can be submitted

**medium** · effort S · code-quality · gap-2

**Where:** `src/app/features/spotting/report-form/report-form.component.ts:172`, `src/app/features/spotting/report-form/report-form.component.ts:288`, `src/app/features/spotting/report-form/report-form.component.html:131`

**Problem.** Changing the line clears the vehicle but not atStation, originStation or destinationStation. The station resource reloads for the new line, so the native selects show a blank value (no option matches the old id), yet the model still holds the old line's station id. The schema only checks that the string is non-empty, so the form validates and the old id is sent in the addEvent mutation. The result is either a backend error that the rider cannot understand, or a spotting filed against a station on the wrong line.

**Recommendation.** Clear all three station fields in the same line-change handler (`atStation: "", originStation: "", destinationStation: ""`). Better, validate station ids against stationOptions() in the schema so a stale value is invalid. Add a spec: pick line A and a station, change to line B, assert the model stations are empty and submit is blocked.

**Verification.** The line-change effect in report-form.component.ts clears only vehicleId and selectedVehicleStatus. Stations come from STATION_LINES_QUERY per line, and the schema only checks that the station is non-empty. A stale station id can therefore be submitted.

<details><summary>Evidence</summary>

```text
effect(() => {
  const lineId = this.model().lineId;
  if (lineId !== this._lastLineId) {
    this._lastLineId = lineId;
    this.model.update((m) => ({ ...m, vehicleId: "", selectedVehicleStatus: "" }));
  }
});
// submit: originStation: m.type === "BETWEEN_STATIONS" ? m.originStation : ...
```

</details>

<a id="f084"></a>

#### F084 · reCAPTCHA loader caches a failed script load forever and there are two separate integrations

**medium** · effort S · reliability · gap-2

**Where:** `src/app/core/recaptcha/recaptcha.service.ts:33`, `src/app/core/recaptcha/recaptcha.service.ts:42`, `src/app/core/recaptcha/recaptcha.service.ts:45`, `src/app/features/console/console.page.ts:5`, `src/app/app.config.ts:17`

**Problem.** If the script load fails once (flaky mobile network, an ad blocker that later gets disabled) the rejected promise is cached, so every later deleteEvent in the same session fails with the same error until a full reload, and the failed script tag stays in the head. execute() has no timeout, so a stalled ready() callback leaves the delete button disabled with no message. The app also carries a second integration, ng-recaptcha-2 (ReCaptchaV3Service) used only by ConsolePage and registered in app.config.ts, so two code paths load api.js for the same site key. RecaptchaService has no spec.

**Recommendation.** Reset `scriptLoadPromise = undefined` and remove the script element in the onerror handler so the next call retries; add a 10 second timeout via Promise.race. Move ConsolePage onto RecaptchaService and drop ng-recaptcha-2 and its providers. Add recaptcha.service.spec.ts for load failure then success.

**Verification.** recaptcha.service.ts caches scriptLoadPromise even after script.onerror rejects, and execute() has no timeout. ng-recaptcha-2 ReCaptchaV3Service is still provided in app.config.ts and used by ConsolePage, and the service has no spec.

**Also reported as:** [F146](forms-uploads-and-sign-in-flows.md#f084) [test-gaps] RecaptchaService caches a failed script load, so deletes and mark-as-read fail until reload (src/app/core/recaptcha/recaptcha.service.ts:28-46); [F317](forms-uploads-and-sign-in-flows.md#f084) [core-shell] Two reCAPTCHA implementations, and the custom one caches a failed script load forever (src/app/core/recaptcha/recaptcha.service.ts:33, src/app/core/recaptcha/recaptcha.service.ts:42)

<details><summary>Evidence</summary>

```text
this.scriptLoadPromise = new Promise<void>((resolve, reject) => {
  ...
  script.onerror = () => reject(new Error("Failed to load reCAPTCHA"));
  document.head.appendChild(script);
});
return this.scriptLoadPromise;
```

</details>

<a id="f100"></a>

#### F100 · The quick-submit form can send the same link twice from the keyboard, and errors are shown twice

**medium** · effort S · reliability · home-ui

**Where:** `src/app/features/home/feed/link-submit-box.component.ts:88`, `src/app/features/home/feed/link-submit-box.component.ts:106`, `src/app/features/home/feed/link-submit-box.component.ts:190`, `src/app/features/home/feed/link-submit-box.component.ts:220`, `src/app/core/graphql/graphql-client.ts:229`

**Problem.** Only the button is disabled while a request is in flight. Pressing Enter again, or holding it (key repeat), calls submit() again and sends a second mutation. The backend dedupes by canonical URL, so the second call comes back as isDuplicate and the reader sees 'Already submitted — your upvote was added' for a link they just submitted once, after the first call's success toast. The mutation also waits for a server-side page-title fetch with a 3 second timeout, so there is a long window for this. For a rejected submission the reader gets both a generic 'GraphQL Error' toast and the inline message, which says the same thing twice and uses the toast title of a developer message.

**Recommendation.** Add `if (this.isSubmitting()) { return; }` as the first line of submit(), and set `aria-busy` on the form. Stop duplicating feedback: GraphQLClient already toasts, so either keep only the inline `role="alert"` message by passing a `silent` option to GraphQLClient.request for this call, or drop the inline note for GraphQLRequestError. Add a spec that dispatches two Enter keydowns before the first request resolves and expects one request.

**Verification.** submit() in link-submit-box has no isSubmitting guard while only the button is disabled, and Enter keydown calls submit() directly. GraphQLClient.request toasts 'GraphQL Error' and the component also sets submitError, so errors are doubled.

<details><summary>Evidence</summary>

```text
link-submit-box.component.ts:88  (keydown.enter)="$event.preventDefault(); submit()"
link-submit-box.component.ts:106  [disabled]="isSubmitting()"
link-submit-box.component.ts:190  async submit(): Promise<void> {   // no isSubmitting() guard
graphql-client.ts:229  this.toast.error("GraphQL Error", error.message);  (and the component also sets submitError)
```

</details>

<a id="f106"></a>

#### F106 · Add a re-entrancy guard to submit() so Enter or the keyboard Go key cannot create duplicate incidents or links

**medium** · effort S · reliability · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.component.ts:563`, `src/app/features/insiden/incident-form/incident-form.component.html:8`, `src/app/features/insiden/link-form/link-form.component.ts:440`, `src/app/features/insiden/link-form/link-form.component.ts:75`

**Problem.** The footer buttons are disabled while isSubmitting() is true, but the form's own (submit) handler, reached by Enter in any text input or the mobile keyboard's Go key, calls submit() with no check. On a slow mobile connection a second Enter issues a second createCalendarIncident or submitSocialMediaLink mutation. Neither mutation has an idempotency key, so the moderation queue receives duplicates.

**Recommendation.** Start submit() with `if (this.isSubmitting()) return;` in both components, and add a spec that calls submit() twice without awaiting and asserts one HTTP request. The built-in `this.incidentForm().submitting()` signal from Signal Forms can replace the hand-rolled flag.

**Verification.** submit() in both forms sets isSubmitting but never checks it first. The incident form has a hidden type=submit button, so Enter reaches the (submit) handler, and only the footer buttons are disabled. A second Enter during an in-flight request issues a second mutation.

<details><summary>Evidence</summary>

```text
async submit(): Promise<void> {
  if (!this.auth.isLoggedIn()) { ... return; }
  this.isSubmitting.set(true);
// html: <form (submit)="$event.preventDefault(); submit()"> ... [disabled]="isSubmitting()" on the footer buttons only
```

</details>

<a id="f108"></a>

#### F108 · Validate lengths and URLs against the backend limits and normalise the link URL before sending

**medium** · effort S · ux · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.schema.ts:29`, `src/app/features/insiden/incident-form/incident-form.component.html:25`, `src/app/features/insiden/link-form/link-form.component.ts:48`, `src/app/features/insiden/link-form/link-form.component.ts:455`, `src/app/features/home/feed/feed-url.util.ts:21`, `rosak_backend/incident/models.py:229`, `rosak_backend/incident/models.py:416`

**Problem.** The backend caps the incident title at 64 characters and URLs at 200, but the forms enforce neither, show no counter and set no maxlength. An over-long title or a long tracking-parameter URL from Facebook, Instagram or a news site reaches the database and comes back as a raw server error toast. The link form sends m.url exactly as typed: no trim and no scheme, although the home quick-submit box already has the tested normalizeFeedUrl. A schemeless value such as x.com/foo is stored and later rendered as a relative href. Chronology source URLs are also unvalidated and are rendered as links on the card (Angular blocks javascript: but allows other schemes such as intent: or ftp:).

**Recommendation.** Add `maxLength(f.title, 64)` plus a `maxlength` attribute and a small 'n/64' hint, and similar caps for the brief. Move normalizeFeedUrl into a shared util, apply it to the link URL and chronology source URLs at submit, and add a schema rule that the result parses as http or https and is at most 200 characters, with copy like 'Use a link that starts with http:// or https:// (up to 200 characters)'. Mirror the same limits in the AI extraction path.

**Verification.** CalendarIncident.title is max_length=64 and the URLFields default to 200, while incident-form.schema.ts has only required() rules and no maxLength. The link form sends m.url untrimmed with no normalization (normalizeFeedUrl exists in home/feed). The footer button sits outside the form, so type=url native validation does not stop it. The intent:/ftp: remark is minor.

**Also reported as:** [F428](forms-uploads-and-sign-in-flows.md#f108) [security] Submit-link form validates only 'required'; add an http(s) scheme check before the mutation (src/app/features/insiden/link-form/link-form.component.ts:50, src/app/features/insiden/link-form/link-form.component.ts:99)

<details><summary>Evidence</summary>

```text
required(f.title, { message: "Enter a title" });  // no maxLength anywhere
url: m.url,   // link form: untrimmed, no scheme added
// backend: CalendarIncident.title = CharField(max_length=64); SocialMediaLink.url = URLField() (default max_length=200); chronology source_url = URLField() (200)
```

</details>

<a id="f110"></a>

#### F110 · Make Summarize non-destructive and tell people their text goes to Google Gemini

**medium** · effort S · ux · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.component.ts:550`, `src/app/features/insiden/incident-form/incident-form.component.html:419`, `src/app/features/insiden/data/incident-ai.service.ts:95`, `functions/src/api.ts:129`

**Problem.** Summarize Incident overwrites whatever the user already typed in Title, Summary and Details with no confirmation and no undo (the extract flow has Undo, summarize does not). The client also sends indicator and sourceUrl for every entry although the server prompt ignores them, and the colour indicator that tells the summarizer which entries are resolutions is lost. Nothing in the UI discloses that chronology text and URLs are sent to Google's Gemini API, and no AI-generated label is attached to the resulting public text; for a Malaysian PDPA-sensitive audience this belongs in the button hint and the privacy page. The summarize prompt asks for 'markdown-capable' details, which the card may not render.

**Recommendation.** Before overwriting, snapshot the three fields and show an 'AI summary applied. Undo' bar (same pattern as the extract undo), or only fill fields that are empty and offer 'Replace' for the rest. Add a one-line hint under the button ('Sends your chronology text to Google Gemini; review before submitting') and mention it in the GDPR copy. Drop unused fields from the request body, or extend the server prompt to use the indicators and times. Ask for plain text unless the card renders markdown.

**Verification.** summarize() overwrites title, brief and details via model.update with no snapshot or undo. The server buildSummarizePrompt uses only datetime and content, so indicator and sourceUrl are unused. Nothing in the UI discloses that text goes to Gemini.

<details><summary>Evidence</summary>

```text
this.model.update((m) => ({
  ...m,
  title: result.title,
  brief: result.brief,
  details: result.details,
}));
```

</details>

<a id="f119"></a>

#### F119 · Logged-out visitors can queue photo uploads that retry forever with no credentials

**medium** · effort S · reliability · insiden-ui

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:393-433`, `src/app/features/insiden/incident-card/incident-card.component.ts:482-502`, `src/app/core/upload/image-upload.service.ts:155-169`

**Problem.** Every card's Photos area is available to everyone, including logged-out visitors. A visitor can pick photos, compress them and press Upload; the success-sounding toast appears, the post goes out without a token, the backend rejects it, and the service re-queues it indefinitely on its interval. The card never tells the visitor that the upload cannot work, and the retry loop keeps hitting the backend.

**Recommendation.** Hide the picker and the upload button unless `auth.isLoggedIn()` (reuse `canAddLink` or a new `canUploadPhotos` computed) and show 'Log in to add photos' with a login action instead. Separately bound the upload service's retries (for example 5 attempts with backoff and a user-visible failure), as the repository's own rule requires for retry loops.

**Verification.** The photos block in incident-card.component.html:393-433 has no auth gate and uploadPhotos queues straight away. image-upload.service.ts:170 re-queues on failure with a comment admitting there is no retry limit.

<details><summary>Evidence</summary>

```text
The photos block renders `<app-photo-picker [(files)]="pendingPhotos" />` and the Upload button with no `auth.isLoggedIn()` check; uploadPhotos() toasts 'Photo upload queued' and calls `this.uploads.addToQueue(...)`; the service posts with `headers: idToken ? { "Firebase-Auth-Key": idToken } : {}` and in the catch does `this.pendingUploads.push(item); throw err;` ('No retry limit/backoff').
```

</details>

<a id="f135"></a>

#### F135 · Photo picker defects: duplicate-name track keys, leaked preview URLs, silent type rejection, unlabeled tiny remove button, no photo cap

**medium** · effort S · ux · spotting

**Where:** `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:23`, `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:28`, `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:72`, `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:77`

**Problem.** Phone cameras and many Android galleries reuse names such as image.jpg, so two photos share a track key (Angular logs duplicate-key errors and may reuse the wrong DOM). Preview object URLs are never revoked, so each photo keeps its full decoded blob alive until the tab closes. Files of other types (WebP, HEIC from some Android pickers) are skipped with no message even though the input says accept='image/*'. The remove control has no accessible name and is about 20 px square, below the 44 px mobile touch target. Previews have empty alt text and there is no limit on photo count, so a user can queue dozens of 8 MB files.

**Recommendation.** Give each ImageFile a generated id (crypto.randomUUID()) and track by it. Revoke previewUrl in _remove, in the form's clear(), and via DestroyRef. Toast 'Skipped N unsupported files (use JPEG or PNG)' or convert WebP/HEIC through the canvas path. Make the remove button `aria-label="Remove photo {n}"` with a `size-8` hit area and give previews alt='Photo {n} preview'. Cap at about 5 photos per report and show 'n of 5'.

**Verification.** Template tracks by image.file.name, the remove button has no aria-label and no sizing, createObjectURL has no revoke anywhere in spotting/upload, alt is empty, and non-ACCEPTED_TYPES files are skipped silently with no cap.

**Also reported as:** [F085](forms-uploads-and-sign-in-flows.md#f135) [gap-2] Photo picker silently drops unsupported files, uses colliding track keys, leaks object URLs and has an unlabeled 20 px remove button (src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:23, src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:31); [F182](forms-uploads-and-sign-in-flows.md#f135) [ux-spotting] Photo picker silently drops files it does not accept and gives remove buttons no name (src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:7, src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:17)

<details><summary>Evidence</summary>

```text
@for (image of files(); track image.file.name) {
...
<button type="button" class="bg-background/80 absolute top-0.5 right-0.5 rounded-full p-0.5 text-xs" (click)="_remove(image)">✕</button>
...
if (!ACCEPTED_TYPES.includes(file.type)) { continue; }
...
previewUrl: URL.createObjectURL(file),   // no revokeObjectURL anywhere in the file
```

</details>

<a id="f138"></a>

#### F138 · The location option has a race, no timeout and no progress, and submit failures from the network are silent

**medium** · effort S · ux · spotting

**Where:** `src/app/features/spotting/report-form/report-form.component.ts:218`, `src/app/features/spotting/report-form/report-form.component.ts:332`, `src/app/features/spotting/report-form/report-form.component.html:169`

**Problem.** If the user picks Location (GPS) and then switches type before the fix arrives, the late success sets capturedLocation and shows 'Location accessed', and a late error forcibly resets the type to Just Spotting, overriding the user's newer choice. There is no `timeout`, so the 'Waiting for location access…' text can sit forever, and the position is taken when the option is chosen, not when the report is sent. When a mutation fails for a network reason (common in tunnels) the HttpErrorResponse is rethrown to the global handler: no toast is shown, the button simply re-enables, and an invalid submit gives no focus or scroll to the first error on a long phone form either.

**Recommendation.** Keep a request token (or a watchWatch id) and ignore callbacks if `model().type` is no longer 'LOCATION'; add `timeout: 15000`; show a spinner and a Retry link while waiting; capture a fresh fix at submit if the stored one is older than about 60 seconds. In submit(), catch HttpErrorResponse and show a toast 'Couldn't send, check your connection. Your report is still here.' Add `scrollIntoView` and `focus()` on the first invalid field when `submit()` returns false.

**Verification.** onTypeChanged has no token, no timeout, and its error callback forces type back to JUST_SPOTTING. GraphQLClient only toasts GraphQLRequestError, while submit() rethrows other errors (HttpErrorResponse) to the global handler with no toast.

<details><summary>Evidence</summary>

```text
navigator.geolocation.getCurrentPosition((position) => { this.capturedLocation.set(position.coords); ...}, (error) => { this.toast.error(...); this.model.update((m) => ({ ...m, type: "JUST_SPOTTING" })); }, { maximumAge: 0, enableHighAccuracy: true });
...
} catch (err) { if (err instanceof GraphQLRequestError) { return; } throw err; }
```

</details>

<a id="f045"></a>

#### F045 · The upload queue retries forever on permanent errors and shows no failure, per-file progress or cancel

**medium** · effort M · reliability · spotting · second check set severity high → medium

**Where:** `src/app/core/upload/image-upload.service.ts:128`, `src/app/core/upload/image-upload.service.ts:155`, `src/app/core/upload/image-upload.service.ts:169`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:80`, `src/app/features/spotting/report-form/report-form.component.ts:320`

**Problem.** The backend answers 401, 403 and 400 for permanent problems (not logged in, not the reporter, bad type). Each one is retried once per second indefinitely, and the item is also persisted in IndexedDB so it comes back after every restart. Users only see a count ('Uploading N'); there is no progress bar, no failed state, no way to remove a bad photo, and the 'Uploads complete' toast never arrives. The copy 'Please wait for uploads to complete before closing this tab' is also stale now that the queue is persisted. If `auth.idToken()` throws, the item is dropped from memory without being re-queued. On trains and platforms with patchy signal this is the common path.

**Recommendation.** Classify errors: retry only network errors and 5xx/429 with exponential backoff and jitter (cap about 5 attempts per session, then park the item as 'failed'); for 4xx delete the persisted record and report once. Use `http.post(..., { observe: 'events', reportProgress: true })` to expose per-item progress, add a `failed` list with Retry and Remove actions in the nav tray, and pause while `navigator.onLine` is false. Move the idToken call inside the try block. Update the success toast to say photos continue uploading next time the app opens.

**Verification.** image-upload.service.ts re-queues every failure with the code comment 'No retry limit/backoff', on a 1s interval, and idToken() is called outside the try. The nav tray only shows 'Uploading N' with no failed state or removal.

**Second check (high-severity pass).** code review: partially (medium). Holds: image-upload.service.ts catch block pushes the item back with the comment 'No retry limit/backoff'. A 1000 ms setInterval re-triggers triggerUpload whenever the queue is non-empty, and each retry rebuilds the FormData and re-sends the whole photo. GenericUpload in rosak_backend/common/views.py does return 400, 401 and 403 for permanent conditions, so those items retry forever. Items are persisted in IndexedDB and reloaded in the constructor, so they return on every app start (for example, a different user logs in and gets 403). The UI shows only 'Uploading N' (app-nav-icon-tray line 80), with no failed state or cancel, and the 'Uploads complete' toast (app-nav.component.ts line 374) never fires for a stuck item. The stale 'Please wait ... before closing this tab' copy is in report-form. `await this.auth.idToken()` is outside the try block. If it rejects, the item has already been removed from pendingUploads (batch swap) and is not re-queued. refreshCounts() then lowers the count, which can fire a false 'Uploads complete' toast. The item stays in IndexedDB until the next restart. Does not hold or is overstated: retrying network errors without a cap is deliberate and correct for patchy train data, so the 'common path' framing is exaggerated. Permanent 4xx is rare, because the form requires login and the reporter owns the event. The real cost is the repeated large uploads at 1 Hz on mobile data, plus the missing feedback. impact review: partially (medium). The code confirms that every failure, including permanent 400, 401 and 403 responses, is pushed back into the queue and retried every second with no limit or backoff, and that auth.idToken() is outside the try block. Persisted records also resume on restart. A permanently bad item would loop forever and keep the nav count stuck, and is hammering the backend. However, the hot path is ordinary success or transient failure, where infinite retry is actually reasonable for patchy signal. The permanent-error case is rarer. The proposed fix (progress events, failed list with Retry and Remove UI, offline pause) is much bigger than needed.

**Fix note from the second check.** Smaller fix than the proposed per-item progress UI. (1) Move idToken() inside the try block. (2) In the catch, read `err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500 && err.status !== 429`; for those, delete the persisted record, drop the item and call reportError once instead of re-queuing. (3) Add a simple backoff, for example skip an item until `Date.now() >= item.nextAttemptAt`. Skip the progress bars and the failed-list UI. Change the toast copy. Smaller fix: in the catch, if err is an HttpErrorResponse with status 400, 401 or 403 (not 0, 429 or 5xx), delete the persisted dbId, drop the item, decrement the pending count and toast once. Otherwise requeue, with a simple attempt counter and backoff. Move the idToken call inside the try. Skip the progress bar and failed-list UI for now.

**Also reported as:** [F194](forms-uploads-and-sign-in-flows.md#f045) [core-shell] Upload queue retries failures forever once per second with no classification, backoff, reporting, or account binding (src/app/core/upload/image-upload.service.ts:128, src/app/core/upload/image-upload.service.ts:141); [F219](forms-uploads-and-sign-in-flows.md#f045) [gap-2] Photo upload queue retries failures forever, once per second, and resumes before auth is ready (src/app/core/upload/image-upload.service.ts:84, src/app/core/upload/image-upload.service.ts:128); [F195](forms-uploads-and-sign-in-flows.md#f045) [core-shell] Upload progress UX is count-only: false 'Uploads complete', no byte progress, no cancel, no failure state (src/app/core/upload/image-upload.service.ts:139, src/app/core/upload/image-upload.service.ts:162)

<details><summary>Evidence</summary>

```text
} catch (err) {
  // No retry limit/backoff — matches current production behavior.
  this.pendingUploads.push(item);
  throw err;
}
...
this.uploadInterval = setInterval(() => { if (this.pendingUploads.length > 0 && !this.isUploading) { this.triggerUpload(); } }, 1000);
...
const idToken = await this.auth.idToken();   // outside the try block
```

</details>

<a id="f188"></a>

#### F188 · Panel actions (Approve, Hide, Reject, Close) discard or ignore the moderator's unsaved edits

**medium** · effort M · reliability · console · severity adjusted from high

**Where:** `src/app/features/console/insiden/links/links.component.ts:1498`, `src/app/features/console/insiden/links/links.component.ts:1280`, `src/app/features/console/insiden/data/link-status-input.util.ts:33`, `src/app/features/console/insiden/pending/pending.component.ts:421`, `src/app/features/console/insiden/pending/pending.component.ts:432`, `src/app/features/console/insiden/pending/pending.component.html:377`

**Problem.** The detail sheets are edit forms with a 'Save changes' button next to Approve / Hide / Mark completed / Reject / Close. Those other buttons do not save. On /console/links, Approve and Hide re-send the stale row via linkStatusInput, so a moderator who corrects the URL, title or tags and then presses Approve publishes the old values and loses the edit (the mutation is replace-not-patch, so it also overwrites tags). On the pending page, Approve ignores the form, and Reject, Close, Escape and a backdrop click call closePanel(), which wipes the model, chronologies and AI extraction state with no warning. There is no dirty indicator. A long chronology edit can be lost with one stray Escape.

**Recommendation.** Prefer a simple dirty confirm on close/reject and 'Save first' hint; 'Save & approve' is optional.

_Original suggestion (corrected by the verifier):_ Track a `dirty` computed (compare the form model and selections to the snapshot taken in openDetail/openLinkDetail). When dirty, make the primary action 'Save & approve' (save, then approve) or disable Approve/Hide with a hint 'Save your changes first'. Intercept `(openChange)`/Close/Reject-from-panel with a 'Discard unsaved changes?' confirm when dirty. For the links sheet, build the status payload from `buildUpdatedLink(link)` rather than from the loaded row when saving first.

**Verification.** links approveFromPanel/hideFromPanel call approveLink/hideLink, which build the payload from the loaded row via linkStatusInput, so unsaved edits are ignored. pending rejectFromPanel and the Close button call closePanel() with no dirty check.

<details><summary>Evidence</summary>

```text
links: approveFromPanel() { const link = this.selectedLink(); ... await this.approveLink(link) }
sendLinkStatus: input: linkStatusInput(link, status)   // built from the loaded ROW, not editUrl()/editTitle()
pending: rejectFromPanel() { ... this.closePanel(); this.openReject(row); }
```

</details>

<a id="f193"></a>

#### F193 · Google sign-in relies on signInWithPopup only, with raw Firebase error text and no mobile or in-app-browser fallback

**medium** · effort M · ux · core-shell

**Where:** `src/app/core/auth/auth.service.ts:105`, `src/app/core/auth/auth.service.ts:115`, `src/app/core/auth/auth.service.ts:118`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:317`

**Problem.** The audience is mostly on phones, and many open links inside Instagram, Facebook, Telegram or WhatsApp in-app browsers where popups are blocked or Google refuses OAuth (disallowed_useragent). The only handling is a toast containing the SDK's raw message such as 'Firebase: Error (auth/popup-blocked).' with no guidance. auth/cancelled-popup-request (a double tap) is toasted as a failure, and there is no redirect fallback.

**Recommendation.** Map codes to plain copy: popup-blocked -> 'Your browser blocked the sign-in window. Allow pop-ups or open this page in Chrome or Safari', cancelled-popup-request -> silent, network-request-failed -> 'You appear to be offline'. On popup-blocked, or when the user agent matches an in-app browser, fall back to signInWithRedirect (and handle getRedirectResult on startup) or show an 'Open in browser' instruction. Keep the existing silent handling for popup-closed-by-user.

**Verification.** login() uses signInWithPopup only and toasts err.message verbatim for everything except popup-closed-by-user. cancelled-popup-request and popup-blocked are not handled. In-app browsers are a real concern for a phone audience.

**Also reported as:** [F221](forms-uploads-and-sign-in-flows.md#f193) [gap-2] Google sign-in is popup-only, so in-app browsers and popup blockers fail with raw Firebase messages (src/app/core/auth/auth.service.ts:105, src/app/core/auth/auth.service.ts:115)

<details><summary>Evidence</summary>

```text
const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
...
if (err instanceof Error && "code" in err && err.code === "auth/popup-closed-by-user") { return undefined; }
this.toast.error("Login failed", err instanceof Error ? err.message : "Unknown error");
```

</details>

<a id="f196"></a>

#### F196 · Image compression breaks on non-JPEG input, can hang forever on odd JPEGs, and may double-apply EXIF orientation

**medium** · effort M · reliability · core-shell

**Where:** `src/app/core/upload/image-compression.service.ts:31`, `src/app/core/upload/image-compression.service.ts:36`, `src/app/core/upload/image-compression.service.ts:93`, `src/app/core/upload/image-compression.service.ts:95`, `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:7`, `src/app/core/upload/image-upload.service.ts:115`

**Problem.** The picker accepts PNG, GIF and TIFF but resizeToSize always calls copyExif, whose retrieveExif rejects anything that is not a JPEG, so a PNG screenshot over 9 MB makes compression throw; the picker has try/finally with no catch, so the thumbnail stays with toCompress true and isCompressed false and can never upload. A truncated or unusual JPEG makes getUint16 throw a RangeError inside a FileReader 'load' listener, which does not reject the surrounding promise, so compression never settles and the 'compressing' state sticks. canvas.toBlob can yield null, which is cast to Blob and becomes a File containing the text 'null'. The output is JPEG but is labelled with the source type (for example image/png). Because canvas drawImage already applies the EXIF orientation in current browsers, copying the original APP1 segment back (with its Orientation tag) can make some viewers rotate a portrait phone photo a second time. Also, addToQueue persists every entry to IndexedDB (line 115) regardless of toCompress/isCompressed, contradicting the class comment that only ready items are persisted; after a reload such an entry is marked ready and uploads the oversize original.

**Recommendation.** Wrap FileReader parsing in try/catch and call reject; bounds-check offsets; skip copyExif for non-JPEG input and set the File type to the actual output blob.type; throw when toBlob returns null; add a catch in the picker that removes the entry and toasts 'Couldn't process this photo'. When re-attaching EXIF, rewrite the Orientation tag to 1 (or drop it, keeping only date and camera tags) and strip GPS if privacy matters. In addToQueue, only persist when !toCompress || isCompressed. Add specs for PNG input, truncated JPEG and a null toBlob (the service has no spec today).

**Verification.** retrieveExif rejects non-JPEG input, and the picker accepts PNG, GIF and TIFF and uses try/finally with no catch. getUint16 inside the FileReader load callback can throw without rejecting, and toBlob's null is cast to Blob. addToQueue persists every entry unconditionally despite the class comment.

**Also reported as:** [F134](forms-uploads-and-sign-in-flows.md#f196) [spotting] A failed or stuck compression strands the photo: non-JPEG files over 9 MB never upload and a malformed JPEG can hang Submit forever (src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:83, src/app/core/upload/image-compression.service.ts:31); [F142](forms-uploads-and-sign-in-flows.md#f196) [test-gaps] Oversized non-JPEG photos are silently dropped from spotting reports and re-queued forever (src/app/core/upload/image-compression.service.ts:27-33, src/app/core/upload/image-compression.service.ts:104-108); [F527](forms-uploads-and-sign-in-flows.md#f196) [gap-2] Image compression fails or hangs on large PNG/GIF/TIFF files, re-decodes the whole photo on every iteration, and may double-rotate (src/app/core/upload/image-compression.service.ts:32, src/app/core/upload/image-compression.service.ts:43)

<details><summary>Evidence</summary>

```text
if (view.getUint16(offset) !== 0xffd8) { return reject(new Error("not a valid jpeg")); }
...
while (marker !== SOS) { ... marker = view.getUint16(offset); }
...
canvas.toBlob((b) => resolve(b as Blob), `image/${format}`, quality)
return new File([blob], file.name, { type: file.type });
// picker: ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/tiff"]; MAX_BYTES = 9e6
```

</details>

<a id="f224"></a>

#### F224 · Spotting draft is destroyed on any sheet close, including an accidental backdrop tap or Escape

**medium** · effort M · ux · gap-2

**Where:** `src/app/features/spotting/report-form/report-form.component.ts:200`, `src/app/features/spotting/report-form/report-form.component.ts:211`, `src/app/features/spotting/spotting-shell/spotting-shell.page.ts:42`

**Problem.** The comment explains why a stale touched state must not survive, but the same code also throws away a half-written report (line, vehicle, notes and picked photos) when the sheet is dismissed by a stray tap on the backdrop, Escape, or the Android back gesture. On a crowded train a rider can easily brush the backdrop; there is no dirty check and no confirmation, and no draft persistence. The line-status sheet explicitly protects its draft across the login popup, but not across an accidental close.

**Recommendation.** Track a `dirty` computed (model differs from emptyReportFormModel or photos present). On close while dirty, ask 'Discard this spotting?' (Keep editing / Discard), or persist the text fields to sessionStorage with a 'Restore draft' prompt on the next open. Keep the full reset for explicit Clear form and for success.

**Verification.** The sheet-state effect calls clear() on any close edge. Its own comment says that includes backdrop click and Escape, wiping model and photos with no dirty check.

**Also reported as:** [F268](forms-uploads-and-sign-in-flows.md#f224) [spotting] Closing the report sheet by backdrop tap or Escape silently destroys the whole draft (src/app/ui/sheet/sheet.ts:45, src/app/features/spotting/report-form/report-form.component.ts:211)

<details><summary>Evidence</summary>

```text
if (!isSheetOpen && this._wasSheetOpen) {
  this.clear();
}
// clear(): this.model.set(emptyReportFormModel()); this.photos.set([]);
```

</details>

<a id="f233"></a>

#### F233 · Make the create-then-submit chain safe to retry and give the version-conflict error a way out

**medium** · effort M · reliability · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.component.ts:629`, `src/app/features/insiden/incident-form/incident-form.component.ts:659`, `src/app/features/insiden/incident-form/incident-form.component.ts:609`, `src/app/features/insiden/incident-form/incident-form.component.ts:681`

**Problem.** For non-admins a new report is two sequential mutations. If createCalendarIncident succeeds and submitCalendarIncident fails (network drop between them, which is likely on mobile), the catch shows a generic error and leaves the sheet open with the form intact. Pressing Submit again runs the CREATE again, so the user ends up with an orphaned DRAFT plus a second incident. On the edit path the first update bumps the server version, but the form keeps echoing the stale target.version, so the retry returns 'Version mismatch' and the user is stuck: Undo All re-hydrates from the same stale target, so the only escape is closing the sheet and losing the edits.

**Recommendation.** Keep the created id in a signal (`createdId`). If it is set when the user retries, skip CREATE and only run SUBMIT; clear it in clear(). For the edit path, store the new version or revision id returned by the update, and on a version-mismatch error offer 'Reload latest and keep my text' (re-fetch the incident, re-hydrate only untouched fields) rather than leaving the user to copy text out by hand. Ideally ask the backend for a single createAndSubmit mutation or an idempotency key so the client does not orchestrate two writes.

**Verification.** Non-admin create runs CREATE and then SUBMIT with no created-id memory, so a retry after a SUBMIT failure creates another incident. The edit path echoes target.version, which is stale once the update has succeeded. Both are inferred from the code, not reproduced.

**Also reported as:** [F222](forms-uploads-and-sign-in-flows.md#f233) [gap-2] Creating an incident is two non-atomic mutations, so a failure of the second step leads to duplicate drafts on retry (src/app/features/insiden/incident-form/incident-form.component.ts:633, src/app/features/insiden/incident-form/incident-form.component.ts:659)

<details><summary>Evidence</summary>

```text
const created = await this.graphql.request<...>(CREATE_CALENDAR_INCIDENT_MUTATION, ...);
if (!this.auth.isAdmin() && created.createCalendarIncident.id !== null) {
  await this.graphql.request<...>(SUBMIT_CALENDAR_INCIDENT_MUTATION, { calendarIncidentId: String(created.createCalendarIncident.id) }, headers);
}
```

</details>

<a id="f234"></a>

#### F234 · Protect long drafts from accidental dismissal and offer to restore them

**medium** · effort M · ux · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.component.ts:276`, `src/app/ui/sheet/sheet.ts:50`, `src/app/features/insiden/incident-form/incident-form.component.html:438`, `src/app/features/insiden/link-sheet/link-sheet.component.ts:36`

**Problem.** Any closing path (backdrop tap, Escape, Cancel, an accidental swipe on mobile, even a route change that destroys the host) wipes the model, all chronology entries and the asset selections immediately. An incident report with several chronology entries and AI-assisted text takes minutes to write. 'Clear form' also discards everything with one tap, sitting next to Cancel and Submit in the footer, and there is no draft persistence.

**Recommendation.** In the sheet services, intercept close when the form is dirty (`incidentForm().dirty() || chronologies().length > 0`) and show a brief 'Discard this report?' confirm. Additionally persist the draft to localStorage (guard with injectIsBrowser and wrap in try/catch, debounce around 500 ms, key per user id, store model, chronologies and selected ids, expire after a day) and show 'Restore your unsent report' when the sheet opens blank. Add a confirm or an Undo toast to 'Clear form'.

**Verification.** An effect calls clear() whenever isOpen goes false, and the sheet closes on backdrop click or Escape. There is no dirty check, confirm or draft persistence, so an accidental tap discards a long report. The impact is real on phones but contained.

<details><summary>Evidence</summary>

```text
effect(() => {
  const isOpen = this.sheet.isOpen();
  if (!isOpen && this._wasSheetOpen) { this.clear(); }
  this._wasSheetOpen = isOpen;
});
// HlmSheet: backdrop (click)="close()" and (document:keydown.escape)="onEscape()"
```

</details>

<a id="f236"></a>

#### F236 · Improve AI failure handling: abort the request, stop contradictory toasts, and show specific error copy

**medium** · effort M · ux · insiden-data

**Where:** `src/app/features/insiden/data/incident-ai.service.ts:131`, `src/app/features/insiden/data/incident-ai.service.ts:139`, `src/app/features/insiden/incident-form/incident-form.component.ts:407`, `src/app/features/insiden/incident-form/incident-form.component.ts:437`, `src/app/features/insiden/incident-form/incident-form.component.html:397`

**Problem.** The 15 second timeout only flips UI state; the fetch has no AbortController, so the request keeps running and a late success later appears under a row the user was told had failed ('Please fill in manually' followed by 'Gemini results in'). A late failure toasts again from the service, so there can be two failure toasts for one click. The server returns JSON {error, message} with 429, 502 and 400 meanings (rate limit 20 per hour, 'Cannot fetch URL', not a valid URL), but the client discards the body and shows 'Data extraction failed: Data extraction failed (429)'. The service toasts and rethrows, and the component catch then swallows the error without logging, which the repository forbids. summarize() has no catch or timeout in the component: a failure rethrows into an unhandled promise rejection, so an expected failure lands in Sentry. The 15 second cap is also shorter than the function's 30 second budget (the code comment says 20), so slow but successful extractions are always treated as failures.

**Recommendation.** Create an AbortController per call, abort on timeout, row removal and sheet close, and use a single result type (`{ok:true,data} | {ok:false,reason:'rate-limit'|'unreachable'|'timeout'|'invalid-url'|'unauthenticated'}`) instead of toast-plus-throw. Parse the JSON error body and map statuses to copy (for example 'You have used your 20 AI requests for this hour. Try again later.'). Show an inline status under the row instead of toasts. Align the client cap with the server (about 25 seconds with a visible Cancel button). Catch expected failures in summarize() so only unexpected errors reach Sentry.

**Verification.** IncidentAiService uses plain fetch with no AbortController, discards the JSON error body, and toasts then rethrows. The component catch swallows the error, and summarize() has no catch, so an expected failure becomes an unhandled rejection. The 15s client cap is below the function's timeoutSeconds, and a late result after the 'fill manually' toast is possible.

**Also reported as:** [F147](forms-uploads-and-sign-in-flows.md#f236) [test-gaps] Incident AI calls have no timeout and trust the response body with an unchecked cast (src/app/features/insiden/data/incident-ai.service.ts:95-106, src/app/features/insiden/data/incident-ai.service.ts:131-142)

<details><summary>Evidence</summary>

```text
if (!res.ok) {
  throw new Error(`Data extraction failed (${res.status})`);
}
...
this.toast.error("Data extraction failed", "Please fill in manually.");  // 15 s timer
...
<span class="text-xs">Gemini results in — click to replace data.</span>
```

</details>

<a id="f306"></a>

#### F306 · AI Summarize overwrites the moderator's title, brief and details with no preview or undo

**low** · effort S · ux · console · partially confirmed

**Where:** `src/app/features/console/insiden/pending/pending.component.ts:697`, `src/app/features/console/insiden/pending/pending.component.ts:701`

**Problem.** Extract Data has a replace/undo flow, but Summarize replaces all three fields immediately, including text the admin may have just edited by hand. A model-generated summary of a public incident is applied silently over reviewed content, and the only recovery is closing the sheet and losing every other edit.

**Recommendation.** Snapshot `{title, brief, details}` before applying and show an 'Undo summary' action in the toast or inline (reuse the `preReplaceSnapshot` idea from the extract state), or show the proposed text in a compare box with Apply/Discard when any of the three fields is non-empty.

**Verification.** The summarize flow was not opened in full here; the finding quotes a model.update that overwrites all three fields, and Extract has its own undo. The point is plausible polish.

<details><summary>Evidence</summary>

```text
this.model.update((m) => ({ ...m, title: result.title, brief: result.brief, details: result.details }));
this.toast.success("Summary ready", "Title, brief and details were filled in.");
```

</details>

<a id="f343"></a>

#### F343 · Upload counters can tell the user 'you can close this tab' while photos are still pending, and a token failure silently drops a photo

**low** · effort S · reliability · gap-2 · partially confirmed · severity adjusted from medium

**Where:** `src/app/core/upload/image-upload.service.ts:138`, `src/app/core/upload/image-upload.service.ts:155`, `src/app/core/upload/image-upload.service.ts:162`, `src/app/core/upload/image-upload.service.ts:186`, `src/app/shell/app-nav/app-nav.component.ts:372`

**Problem.** pendingCount is sometimes set from the array length and sometimes decremented. triggerUpload swaps the in-flight batch out of pendingUploads, so an addToQueue made during an upload resets the count to only the new items. When the in-flight photo then finishes, the decrement reaches 0 and the nav shows 'Uploads complete, you can close this tab' while a second photo is still outstanding. Separately, `await this.auth.idToken()` sits outside the try block, so a rejection (offline with an expired token) removes the item from memory without re-queueing it, and the end-of-pool refreshCounts can then fire the same false 'complete' toast.

**Recommendation.** Make the count a computed over one source of truth (queued plus in-flight plus retrying) instead of mixing set() and update(). Move the idToken call inside the try so a failure re-queues the item. Fire the completion toast only when queued, in-flight and parked are all zero. Add a spec that queues a second photo mid-upload.

**Verification.** The pendingCount mix is confirmed: refreshCounts() sets the count from pendingUploads.length, which excludes the in-flight batch, and the nav effect toasts 'you can close this tab' on reaching 0. idToken() is also outside the try, so a rejection drops the item from memory, though it stays in IndexedDB. Needs a second photo queued mid-upload or a token rejection, so it is narrow.

<details><summary>Evidence</summary>

```text
const batch = this.pendingUploads;
this.pendingUploads = [];
...
this.pendingCount.update((n) => n - 1);
...
this.pendingCount.set(this.pendingUploads.length);
// app-nav: if (pending === 0 && wasUploading) { this.toast.success("Uploads complete", "...you can close this tab now.") }
```

</details>

<a id="f439"></a>

#### F439 · Upload batch can lose un-started photos after one failure, and the pool result is discarded

**low** · effort S · testing · test-gaps · partially confirmed · severity adjusted from high

**Where:** `src/app/core/upload/image-upload.service.ts:136-177`

**Problem.** triggerUpload() takes the whole queue into a local batch and clears pendingUploads before processing. The per-item catch re-queues only the item that failed, then rethrows. The rethrow is handled by @supercharge/promise-pool, and the code never reads the returned errors. My understanding of that library's documented default is that it stops scheduling new items after the first error. If so, every item in the batch that had not started yet is never re-queued and is lost for the session, even though the photo file itself may still be in IndexedDB. There is also no try/finally, so isUploading stays true if anything throws outside the per-item handler. The only spec for this service covers the IndexedDB delete failure path. I did not open node_modules to confirm the library default, so the test below is what would settle it.

**Recommendation.** Drop the handleError change; the default already re-queues. Move the idToken await inside the try so a token failure re-queues the item. Fix the spec expectation: with concurrency 1, items 1 and 3 succeed and item 2 is re-queued, so pendingCount() should be 1. Optional try/finally around isUploading is defensive only, since the default pool does not throw.

_Original suggestion (corrected by the verifier):_ Add a spec with HttpClient.post mocked to fail for item 2 of 3 at concurrency 1, then assert pendingCount() equals 3 after triggerUpload() resolves. Fix by using the pool's error handler so each failure re-queues only its own item: `.handleError(async (_err, item) => { this.pendingUploads.push(item); })`. Wrap the body of triggerUpload in try/finally so isUploading and the interval cleanup always run. Keep the existing no-backoff behaviour, which the code comment already documents as a deliberate choice.

**Verification.** The finding's premise is wrong: @supercharge/promise-pool's default (no handleError) collects errors and keeps processing the remaining items, per the library README; it does not stop scheduling after the first error. The failed item is re-pushed in the catch, so no item is lost from the batch. The real but narrow gap is that the auth.idToken() call sits outside the try, so a token failure drops that item (IndexedDB still holds it), and the test's expected pendingCount of 3 is wrong (it would be 1 after one failure).

<details><summary>Evidence</summary>

```text
await PromisePool.withConcurrency(environment.upload.concurrency)
  .for(batch)
  .process(async (item) => {
    ...
          this.pendingUploads.push(item);
          throw err;
  });

this.isUploading = false;
```

</details>

<a id="f562"></a>

#### F562 · Protect admin edits on /about: confirm discard, label the fields, and avoid last-write-wins

**low** · effort M · ux · profile-about-misc

**Where:** `src/app/features/about/editor/about-editor.component.html:50`, `src/app/features/about/editor/about-editor.component.html:76-123`, `src/app/features/about/editor/about-editor.component.html:281-285`, `src/app/features/about/about.page.ts:225`

**Problem.** Cancel throws away the entire draft immediately, and so does navigating away or reloading (no beforeunload guard); Remove deletes a person, project or social row with no confirmation or undo. Most inputs rely on placeholder text only (no label), including four per person. Saving does a full-document setDoc from a draft that was copied once at open time, so two admins editing at once silently overwrite each other, and the editor never shows what visitors will see before you press Save.

**Recommendation.** Track a `dirty` computed (draft vs initial) and confirm on Cancel and on beforeunload when dirty; make Remove soft (an 'Undo' toast for 5 s). Give each input an aria-label or visible label. Before saving, compare the doc's current updateTime/version (read with getDoc, or store an `updatedAt` field and use a transaction) and warn 'someone else edited this page' instead of overwriting.

**Verification.** saveDoc does a full setDoc from the draft. The editor has only 3 aria-labels across about 25 placeholder/label hits, with no dirty guard or remove confirmation. Admin-only, so low impact.

<details><summary>Evidence</summary>

```text
<button hlmBtn variant="ghost" size="sm" (click)="removeProject($index)">Remove</button>
<input hlmInput class="min-w-40 flex-1" placeholder="Name" [value]="person.name" ... />
<button hlmBtn variant="ghost" [disabled]="saving()" (click)="dismissed.emit()">Cancel</button>
await setDoc(firestoreDoc(getFirestore(firebaseApp()), "public", "about"), doc);
```

</details>
