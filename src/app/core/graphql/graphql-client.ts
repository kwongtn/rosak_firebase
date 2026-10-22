import { HttpClient, HttpContext, type HttpResourceOptions } from "@angular/common/http";
import { isPlatformBrowser } from "@angular/common";
import {
  computed,
  effect,
  inject,
  Injectable,
  linkedSignal,
  signal,
  DestroyRef,
  PLATFORM_ID,
} from "@angular/core";
import { httpResource } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import * as Sentry from "@sentry/angular";

import { AuthService } from "../auth/auth.service";
import { injectIsBrowser } from "../composables/is-browser";
import { ANONYMOUS } from "../http/auth.interceptor";
import { environment } from "../../../environments/environment";
import { ToastService } from "../../ui/toast/toast.service";
import { deepEqual } from "../util/deep-equal.util";
import { GraphQLError, GraphQLResponse } from "./types";

interface GraphQLRequestBody {
  query: string;
  variables?: Record<string, unknown>;
}

export class GraphQLRequestError extends Error {
  constructor(public readonly errors: GraphQLError[]) {
    super(errors.map((e) => e.message).join("; ") || "GraphQL request failed");
  }
}

/** First retry after 5s, doubling each further consecutive failure, capped at 3 minutes — a
 * transient blip recovers fast, but a truly down backend doesn't get hammered forever. */
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 3 * 60 * 1000;

/**
 * Reactive GraphQL query — thin wrapper over httpResource() so reads get Angular's
 * automatic SSR-to-browser TransferState for free (the reason this app uses signals
 * instead of Apollo Angular; see archive/frontend-map/shared-services-and-plumbing.md).
 *
 * On failure, automatically retries in the background with exponential backoff (capped at 3
 * minutes) — `retryCountdownSec`/`retryNow` let a caller surface that countdown and offer an
 * immediate manual retry, rather than the caller having to build its own retry loop.
 *
 * `isLoading` deliberately only ever reports `true` for the very first, pristine fetch (before
 * this resource has ever either succeeded or failed once) — once an error has happened, every
 * later attempt (automatic or manual) is a *background* retry from the caller's point of view:
 * `isLoading` stays `false` throughout it, `hasError` stays `true` throughout it, and only a
 * definitive success flips `hasError` back to `false`. Without that, a page whose template is
 * `@if (isLoading) {skeleton} @else if (hasError) {...}` would flash the loading skeleton again
 * on every retry attempt, which reads as the page restarting from scratch rather than quietly
 * trying again behind an already-shown error state.
 *
 * `isFetching` is the COMPLEMENT of that narrowing, and exists because the narrowing hides the one
 * thing a caller cannot get any other way: it is the raw `httpResource` in-flight flag, so it is
 * `true` WHILE ANY REQUEST IS IN FLIGHT — the pristine first fetch, a `reload()`, or an automatic
 * retry ATTEMPT alike — where `isLoading` goes `false` forever after the first success or failure.
 * Read the word "in flight" literally: the exponential-backoff WAIT between two attempts is not a
 * request, so `isFetching` is `false` for those seconds while `hasError` stays `true` and
 * `retryCountdownSec` counts down. Anything that must react to a REFRESH completing (a "refreshed,
 * no changes" confirmation, a spinner during a manual reload) has to key on `isFetching`, because a
 * `_pending` boolean + `isLoading` effect can never observe a reload: the effect simply does not
 * re-run. Keep the two apart — `isLoading` is the skeleton gate, `isFetching` is the in-flight
 * state.
 *
 * `data()` and `errors()` are TOTAL: a failed request never makes them throw.
 * `httpResource().value()` throws while the request is in its error state, so both read
 * `hasValue()` first and answer `undefined` when there is no value. `data()` also keeps the LAST
 * GOOD payload through a failed or retrying refresh of the SAME request (same query and variables),
 * so a failed poll leaves the old data on screen beside the retry banner instead of blanking it. As
 * soon as the request changes (other variables or query, or `requestFn` returns `undefined`) the
 * kept payload is dropped and `data()` is `undefined` until the new request succeeds: one request's
 * answer must never be shown under another's variables.
 *
 * By default, a refresh whose GraphQL response is structurally equal to the current response
 * retains the previous object reference. That keeps computed signals, effects, and DOM bindings
 * from churning while route keep-alive pages revalidate silently in the background (see
 * `.omo/plans/spotting-route-persistence.md`); only genuinely different payloads replace `data()`.
 * Set `retainDataIfEqual` to `false` when a caller needs every response to become a new reference.
 *
 * A read is anonymous by default ({@link ANONYMOUS}): a public answer, the same for everyone, that
 * the SSR transfer cache can hand over. With `authenticated: true` the auth interceptor adds the
 * signed-in viewer's token, and the first request waits for `AuthService.whenReady`, so a session
 * that Firebase is still restoring is not read as signed out.
 *
 * Only for queries (idempotent reads). Mutations should call
 * `inject(GraphQLClient).request(query, variables, headers)` directly from an event handler —
 * httpResource re-issues its request whenever a dependency signal changes, which is the wrong
 * lifecycle for a one-shot write.
 */
export function graphqlResource<TData, TVars = Record<string, unknown>>(
  requestFn: () => { query: string; variables?: TVars } | undefined,
  options?: { retainDataIfEqual?: boolean; authenticated?: boolean },
) {
  const retainIfEqual = options?.retainDataIfEqual ?? true;
  const authenticated = options?.authenticated ?? false;
  const authReady = signal(!authenticated);
  if (authenticated) {
    void inject(AuthService).whenReady.then(() => authReady.set(true));
  }
  const resourceOptions: HttpResourceOptions<GraphQLResponse<TData>, unknown> | undefined =
    retainIfEqual
      ? {
          equal: (a, b) => deepEqual(a, b),
        }
      : undefined;

  const raw = httpResource<GraphQLResponse<TData>>(() => {
    const req = authReady() ? requestFn() : undefined;
    if (!req) {
      return undefined;
    }
    return {
      url: environment.backendGraphqlUrl,
      method: "POST",
      body: { query: req.query, variables: req.variables ?? {} } satisfies GraphQLRequestBody,
      context: authenticated ? undefined : new HttpContext().set(ANONYMOUS, true),
    };
  }, resourceOptions);

  // `raw.value()` throws in the error state (and an error state is exactly when a consumer reads
  // these), so both go through `hasValue()` first and just say "nothing" instead.
  const errors = computed(() => (raw.hasValue() ? raw.value()?.errors : undefined));
  const latestData = computed(() => (raw.hasValue() ? raw.value()?.data : undefined));

  // The request being answered, as a comparable string; `undefined` while none is configured.
  const requestKey = computed(() => {
    const req = requestFn();
    return req && JSON.stringify([req.query, req.variables ?? {}]);
  });

  // The last payload that answered the CURRENT request. A new payload replaces it; no payload (HTTP
  // failure, a retry in flight, or a GraphQL `errors` answer without data) keeps it only while the
  // key is unchanged, otherwise it is dropped. A linkedSignal rather than an effect, so the memory
  // is part of the graph; the settle effect below reads `data()` on every success, which keeps it
  // current.
  const lastGood = linkedSignal<
    { key: string | undefined; payload: TData | undefined },
    { key: string | undefined; payload: TData } | undefined
  >({
    source: () => ({ key: requestKey(), payload: latestData() }),
    computation: ({ key, payload }, previous) => {
      if (payload != null) {
        return { key, payload };
      }
      const last = previous?.value;
      return last?.key === key ? last : undefined;
    },
  });
  const data = computed(() => lastGood()?.payload);
  const hasGraphQLErrors = computed(() => (errors()?.length ?? 0) > 0);
  const rawHasError = computed(() => raw.error() !== undefined || hasGraphQLErrors());

  const hasEverLoaded = signal(false);
  const hasError = signal(false);
  const attempt = signal(0);
  const retryCountdownSec = signal<number | null>(null);

  let retryTimer: ReturnType<typeof setInterval> | undefined;
  const clearRetryTimer = () => {
    clearInterval(retryTimer);
    retryTimer = undefined;
    retryCountdownSec.set(null);
  };

  function retryNow(): void {
    clearRetryTimer();
    raw.reload();
  }

  function scheduleRetry(): void {
    clearRetryTimer();
    // `attempt` already counts the failure being scheduled for, so the first retry waits the base delay.
    const delayMs = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt() - 1), RETRY_MAX_DELAY_MS);
    let remainingSec = Math.round(delayMs / 1000);
    retryCountdownSec.set(remainingSec);
    retryTimer = setInterval(() => {
      remainingSec -= 1;
      if (remainingSec <= 0) {
        clearRetryTimer();
        raw.reload();
        return;
      }
      retryCountdownSec.set(remainingSec);
    }, 1000);
  }

  // Only meaningful in the browser — SSR has no timers to keep alive across a response, and
  // this whole retry loop is a client-side, post-hydration concern anyway. inject() still has
  // to run unconditionally (it only works synchronously within the call that set up this
  // injection context), so the platform check itself is the *only* thing gated below.
  const isBrowser = injectIsBrowser();
  const destroyRef = inject(DestroyRef);

  if (isBrowser) {
    effect(() => {
      const nowLoading = raw.isLoading();
      const nowHasError = rawHasError();
      if (nowLoading) {
        // A request is in flight (initial or retry) — nothing to decide until it settles.
        return;
      }
      if (nowHasError) {
        hasError.set(true);
        attempt.update((n) => n + 1);
        scheduleRetry();
        return;
      }
      // Settled with no error: either genuine success, or simply no request was ever
      // configured (requestFn() returned undefined) — only the former should flip the
      // "recovered" state.
      if (data() !== undefined) {
        hasEverLoaded.set(true);
        hasError.set(false);
        attempt.set(0);
        clearRetryTimer();
      }
    });

    destroyRef.onDestroy(clearRetryTimer);
  }

  return {
    /** Parsed `data` object once resolved, `undefined` while loading/absent. */
    data,
    /** Top-level GraphQL `errors`, if the backend returned any alongside (or instead of) data. */
    errors,
    /** True only for the very first, pristine fetch — see the function's own doc comment. */
    isLoading: computed(() => raw.isLoading() && !hasEverLoaded() && !hasError()),
    /** True while ANY request is in flight — the pristine first fetch, a `reload()`, or a retry
     * attempt. Deliberately DISTINCT from `isLoading`, which is pristine-first-fetch-only and stays
     * `false` for every later attempt; use this one to observe a refresh actually completing.
     * FALSE during the backoff WAIT between attempts — nothing is on the wire then. */
    isFetching: computed(() => raw.isLoading()),
    /** True on either a transport-level failure or a GraphQL-level `errors` array — stays
     * true across background retries until one definitively succeeds. */
    hasError: hasError.asReadonly(),
    transportError: raw.error,
    reload: () => raw.reload(),
    /** Seconds until the next automatic retry, or `null` when none is scheduled (currently
     * loading, or not currently in an error state). */
    retryCountdownSec: retryCountdownSec.asReadonly(),
    /** Retries immediately, canceling whatever automatic countdown was pending. */
    retryNow,
  };
}

/** Per-call options of {@link GraphQLClient.request}. */
export interface GraphQLRequestOptions {
  /**
   * Milliseconds before the request is abandoned. It then rejects with an `HttpErrorResponse` of
   * status 0, the same shape as a dropped connection. Unset, only the browser gives up.
   */
  timeout?: number;
  /**
   * Skip the client's own "GraphQL Error" toast, for a background caller that tells the rider with
   * its own words. The error is still thrown and still reported to Sentry.
   */
  quiet?: boolean;
}

/**
 * One-shot GraphQL call for mutations (or queries fired imperatively, e.g. on submit)
 * rather than bound to the signal graph. Throws GraphQLRequestError if the response
 * carries a top-level `errors` array, so callers can rely on try/catch.
 *
 * The auth interceptor (`core/http/auth.interceptor.ts`) adds a signed-in viewer's
 * `firebase-auth-key` and keeps such a request out of the SSR transfer cache; a signed-out
 * viewer's request goes out anonymous. A failed token refresh rejects with Firebase's error.
 */
@Injectable({ providedIn: "root" })
export class GraphQLClient {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly platformId = inject(PLATFORM_ID);

  async request<TData, TVars = Record<string, unknown>>(
    query: string,
    variables?: TVars,
    extraHeaders?: Record<string, string>,
    options?: GraphQLRequestOptions,
  ): Promise<TData> {
    const body: GraphQLRequestBody = { query, variables: variables ?? {} };
    const response = await firstValueFrom(
      this.http.post<GraphQLResponse<TData>>(environment.backendGraphqlUrl, body, {
        headers: extraHeaders,
        timeout: options?.timeout,
      }),
    );
    // Check errors FIRST before returning data. If GraphQL returned any errors,
    // throw GraphQLRequestError so callers (mutations/imperative requests) properly catch
    // failures even if partial or null data was returned alongside errors.
    if (response.errors && response.errors.length > 0) {
      throw this.surface(new GraphQLRequestError(response.errors), options);
    }
    if (response.data !== undefined) {
      return response.data;
    }
    throw this.surface(
      new GraphQLRequestError([{ message: "GraphQL response had no data" }]),
      options,
    );
  }

  /** In the browser, toasts the error (unless `quiet`) and reports it to Sentry; returns it. */
  private surface(
    error: GraphQLRequestError,
    options?: GraphQLRequestOptions,
  ): GraphQLRequestError {
    if (isPlatformBrowser(this.platformId)) {
      if (!options?.quiet) {
        this.toast.error("GraphQL Error", error.message);
      }
      Sentry.captureException(error);
    }
    return error;
  }
}
