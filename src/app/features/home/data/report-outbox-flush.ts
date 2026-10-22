import {
  EnvironmentProviders,
  effect,
  inject,
  provideEnvironmentInitializer,
  untracked,
} from "@angular/core";

import { injectIsBrowser } from "../../../core/composables/is-browser";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { OnlineService } from "../../../core/network/online.service";
import {
  ReportOutboxService,
  type ReportOutboxSender,
} from "../../../core/offline/report-outbox.service";
import { HomeStore } from "./home.store";
import { sendQueuedLineStatusReport } from "./submit-line-status-report";

/**
 * Registers the line status outbox's flush on the home route (`home.routes.ts`), in the browser
 * only. The trigger lives with the route, not in `core/` or `app.config.ts`, so the outbox, its
 * Firebase Auth dependency and the mutation stay in the lazy front-page chunk, and so the board it
 * refreshes after a send is the one this route owns. Consequence: a report queued here is flushed
 * from the first visit to `/` after the app starts (the installed app's start URL), not from a
 * cold start on another route; if that visit comes too late, the report expires.
 *
 * Flushes on the effect's first run (the route's start), whenever `OnlineService` comes back
 * online, and on every board refresh beat while online. The beat is there because in a tunnel
 * `navigator.onLine` stays `true` on a link that carries nothing, so no `online` event ever comes;
 * an empty outbox makes each of those a storage read. After a flush that sent anything, the board
 * reloads through `HomeStore.reloadAll()`, the path a submit takes.
 */
export function provideReportOutboxFlush(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    if (!injectIsBrowser()) {
      return;
    }
    const outbox = inject(ReportOutboxService);
    const online = inject(OnlineService);
    const store = inject(HomeStore);
    const graphql = inject(GraphQLClient);
    const send: ReportOutboxSender = (report) => sendQueuedLineStatusReport(graphql, report);

    effect(() => {
      store.linesRefreshTick();
      if (!online.isOnline()) {
        return;
      }
      untracked(() => {
        // Not caught here: an unexpected failure reaches the Sentry-backed ErrorHandler.
        void outbox.flush(send).then((sent) => {
          if (sent > 0) {
            store.reloadAll();
          }
        });
      });
    });
  });
}
