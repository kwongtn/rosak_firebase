import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, computed, effect, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";

import {
  PreferencesService,
  PreferencesViewMode,
} from "../../../core/preferences/preferences.service";
import {
  parseEnumQueryParam,
  queryParamForWrite,
  readEnumQueryParam,
  readTextQueryParam,
  writeQueryParams,
} from "../../../core/url-state/query-param.util";

/** Every view the toggle offers. Named once so the service's parse and the board's buttons agree. */
export const HOME_VIEW_MODES: readonly PreferencesViewMode[] = ["rider", "pro"];

/**
 * The view with nothing chosen — and therefore the value `?view=` OMITS.
 *
 * "rider" is the default because it is what a first-time reader (and every share of this page
 * without a parameter) should see: the rider view is the readable one, and Pro is a deliberate
 * choice rather than the fallback.
 */
export const DEFAULT_HOME_VIEW: PreferencesViewMode = "rider";

/** The URL param the view rides in. Named once so the read and write halves cannot drift. */
export const VIEW_PARAM = "view";

/**
 * The ONE owner of "which view is this page in": `?view=` when the URL carries one, otherwise the
 * reader's stored `PreferencesService.viewMode`.
 *
 * 🔴 **This used to live inside `NetworkBoardComponent`, and that was the bug this service exists
 * to remove.** The Pro dashboard needs the same answer — it decides between two entirely different
 * page layouts — and the page needs it a third time. Three copies of "URL wins, else the
 * preference" is three places for the two halves to disagree: a copy that forgot the URL would
 * render the bento grid to somebody who opened `?view=rider`, and a copy that forgot the preference
 * would forget the reader's choice the moment they navigated without a query string. One service,
 * one answer, and every host renders whatever it says.
 *
 * Three rules, all inherited from `core/url-state/query-param.util` rather than re-derived:
 *
 *  - **The URL wins when it is PRESENT, and the preference answers when it is absent.**
 *    `readTextQueryParam` is what tells "absent" from "present but unrecognised": the latter
 *    degrades to {@link DEFAULT_HOME_VIEW} rather than to the stored preference, because a URL is
 *    user input and must resolve to something the UI actually offers.
 *  - **A default never appears in the URL.** `queryParamForWrite` writes `view=rider` as `null`, so
 *    "no query params" and "the rider view" are one state and a plain page load carries no
 *    parameter it did not choose. A STORED pro view IS mirrored into the URL on load — that is the
 *    shareable half.
 *  - **The write is browser-gated and guarded on redundancy.** A reactive `router.navigate()` during
 *    SSR hangs the render (the server waits on a navigation the client will never answer), and an
 *    unguarded write would make a browser back/forward immediately re-navigate onto the very
 *    parameters it just left.
 *
 * `setView()` writes BOTH halves — the preference AND the URL — because each alone promises
 * something the reader can observe: the preference survives a reload, the URL survives being sent
 * to somebody else. A toggle that wrote only one of them would break one of those promises.
 *
 * Route-scoped, like `HomeStore`: it reads `ActivatedRoute` and the router, neither of which is a
 * page-scoped resource, and a second copy of the answer is exactly what must not exist.
 */
@Injectable()
export class HomeViewModeService {
  private readonly preferences = inject(PreferencesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * The query params as a signal, SEEDED FROM THE SNAPSHOT.
   *
   * The seed is what makes a deep link render the same value on the server as on the client:
   * without it the first read — the one the server render itself performs — would see an empty map
   * that the first observable emission then contradicts, and `?view=pro` would paint the bento grid
   * on the client over the rider panels the server already sent.
   */
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /**
   * The view in force, and the ONLY thing a host has to ask.
   *
   * A `computed`, not a mirror of the preference in a signal: two writable copies of one fact is
   * precisely the arrangement that lets the board's toggle and the page's layout disagree for one
   * render.
   */
  readonly view = computed<PreferencesViewMode>(() => {
    const params = this.queryParamMap();
    if (readTextQueryParam(params, VIEW_PARAM) === null) {
      return this.preferences.viewMode();
    }
    return readEnumQueryParam(params, VIEW_PARAM, HOME_VIEW_MODES, DEFAULT_HOME_VIEW);
  });

  /** The view with nothing chosen, re-exported so a host's "is this the default?" reads one place. */
  readonly isDefaultView = computed(() => this.view() === DEFAULT_HOME_VIEW);

  /**
   * Switches the view, writing the durable preference AND the shareable URL.
   *
   * 🔴 **It writes the URL ITSELF rather than waiting for the mirroring effect above**, and that is
   * not duplication — it is the only way the control can ever leave a URL that already pins the
   * OTHER view. `view()` is URL-first, so on a page opened as `?view=pro` a `setView("rider")` that
   * only touched the preference would leave the effective view reading `pro`, the effect would see
   * no change, and the button would look dead. (That is exactly what the board's own toggle did
   * while this logic lived inside it; its spec only ever toggled UP, from a URL-less page, so the
   * trap was invisible.) Writing both halves here makes the control correct from ANY starting URL,
   * and the effect then finds the URL already agreeing and stays quiet.
   *
   * Only this method writes the view. A host that called `PreferencesService.setViewMode()` directly
   * would persist the choice and leave the URL stale — a reader who copied the address bar would
   * have handed somebody else the wrong layout, with no error anywhere to notice it by.
   *
   * An unrecognised value degrades to the default rather than throwing, matching the URL parse's own
   * rule (a value the UI never offers must not become the state of the page).
   */
  setView(view: PreferencesViewMode): void {
    const next = parseEnumQueryParam(view, HOME_VIEW_MODES, DEFAULT_HOME_VIEW);
    this.preferences.setViewMode(next);
    const target = queryParamForWrite(next, DEFAULT_HOME_VIEW);
    if (target === readTextQueryParam(this.queryParamMap(), VIEW_PARAM)) {
      return;
    }
    writeQueryParams(this.router, this.route, { [VIEW_PARAM]: target }, this.isBrowser);
  }

  constructor() {
    // WRITE half: mirror the effective view into the URL. Browser-gated (see the class doc), and
    // guarded on "the URL already says this" so a back/forward does not bounce off itself.
    effect(() => {
      const target = queryParamForWrite(this.view(), DEFAULT_HOME_VIEW);
      if (target === readTextQueryParam(this.queryParamMap(), VIEW_PARAM)) {
        return;
      }
      writeQueryParams(this.router, this.route, { [VIEW_PARAM]: target }, this.isBrowser);
    });

    // READ half, mirrored DOWN into the durable state. Without this the board would revert to the
    // stored preference the moment the reader edited the URL away, and a shared `?view=pro` link
    // would be a one-frame suggestion rather than a state. `signal.set` with an equal value does
    // not notify, so this never fights a toggle that already wrote both halves.
    effect(() => {
      const view = this.view();
      if (view !== this.preferences.viewMode()) {
        this.preferences.setViewMode(view);
      }
    });
  }
}
