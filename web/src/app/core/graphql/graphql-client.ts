import { HttpClient } from "@angular/common/http";
import { isPlatformBrowser } from "@angular/common";
import { computed, effect, inject, Injectable, signal, DestroyRef, PLATFORM_ID } from "@angular/core";
import { httpResource } from "@angular/common/http";
import { firstValueFrom } from "rxjs";

import { environment } from "../../../environments/environment";
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
 * instead of Apollo Angular; see docs/frontend-map/shared-services-and-plumbing.md).
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
 * Only for queries (idempotent reads). Mutations should call `postGraphQL` directly
 * from an event handler — httpResource re-issues its request whenever a dependency
 * signal changes, which is the wrong lifecycle for a one-shot write.
 */
export function graphqlResource<TData, TVars = Record<string, unknown>>(
    requestFn: () => { query: string; variables?: TVars } | undefined
) {
    const raw = httpResource<GraphQLResponse<TData>>(() => {
        const req = requestFn();
        if (!req) {
            return undefined;
        }
        return {
            url: environment.backendGraphqlUrl,
            method: "POST",
            body: { query: req.query, variables: req.variables ?? {} } satisfies GraphQLRequestBody,
        };
    });

    const errors = computed(() => raw.value()?.errors);
    const data = computed(() => raw.value()?.data);
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
        const delayMs = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt(), RETRY_MAX_DELAY_MS);
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
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
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

/**
 * One-shot GraphQL call for mutations (or queries fired imperatively, e.g. on submit)
 * rather than bound to the signal graph. Throws GraphQLRequestError if the response
 * carries a top-level `errors` array, so callers can rely on try/catch.
 */
@Injectable({ providedIn: "root" })
export class GraphQLClient {
    private readonly http = inject(HttpClient);

    async request<TData, TVars = Record<string, unknown>>(
        query: string,
        variables?: TVars,
        extraHeaders?: Record<string, string>
    ): Promise<TData> {
        const body: GraphQLRequestBody = { query, variables: variables ?? {} };
        const response = await firstValueFrom(
            this.http.post<GraphQLResponse<TData>>(environment.backendGraphqlUrl, body, {
                headers: extraHeaders,
            })
        );
        // GraphQL allows partial success: a resolver error on one nested field (e.g. the
        // zero-spotting `withMostEntries` IndexError documented in profile.md) can come back
        // alongside otherwise-usable `data` for every other field. Only throw when there's
        // truly nothing to work with — prefer handing back partial data over failing the whole
        // call for one broken field a caller may not even care about.
        if (response.data !== undefined) {
            return response.data;
        }
        throw new GraphQLRequestError(response.errors ?? [{ message: "GraphQL response had no data" }]);
    }
}
