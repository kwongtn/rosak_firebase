import { DatePipe } from "@angular/common";
import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";

import { HlmBadge } from "../../../ui/badge/badge";
import { HomeIncidentItem, HomeIncidentSeverity } from "../data/home.queries";
import { HomeStore } from "../data/home.store";

/** `CalendarIncidentSeverity` → badge variant, so a MAJOR row cannot read as quieter than a MINOR
 *  one by accident. The map is exhaustive over the enum: adding a severity fails to compile here
 *  rather than rendering an unstyled row. */
const SEVERITY_VARIANT = {
  MAJOR: "destructive",
  MINOR: "warning",
  OTHERS: "neutral",
} as const;

/**
 * The Pro dashboard's RECENT INCIDENTS widget.
 *
 * 🔴 **It is its own lazy read, and that is the point.** A Pro dashboard is several widgets on one
 * page, and this is the one most likely to be slow or unavailable — it is the only one that reaches
 * past the line and feed data into the incident model. It therefore opts in explicitly
 * (`store.requestIncidentsRead()`), reads the store's OWN `incidentsFailed`, and hides itself on a
 * failure or an empty answer. It appears in neither `HomeStore.hasError` nor `isRefreshing`, so it
 * cannot put the page's retry banner over a working board, and it cannot hold the refresh control's
 * "Updating" label open. That asymmetry is the store's documented rule, not a special case here.
 *
 * 🔴 **The window is the BACKEND's, not a date this side computes.** The read asks for
 * `ongoing: true` — incidents with no end date yet — ordered by `startDatetime DESC`, from a
 * compile-time-constant variables object (see `HOME_RECENT_INCIDENT_VARS` for why a client clock in
 * query variables is banned in this project). So the widget is honest about what it shows: the
 * heading says "Recent incidents" and the sub-label says **ongoing · newest first**, because that is
 * precisely the set. A "last 7 days" reading would need a date range this client cannot compute
 * without breaking SSR's variable equality, and a widget that quietly claimed a window it does not
 * have would be worse than a narrower honest one.
 *
 * The backend returns an ordered LIST with no limit argument, so the newest `PRO_INCIDENT_LIMIT` rows
 * are sliced client-side. The count in the sub-label is the number SHOWN, not the number returned —
 * a widget that said "6 incidents" while holding forty would make the reader think the other thirty
 * four did not exist.
 *
 * Rows link to `/insiden`, which is where an incident is actually read and reported on: this widget
 * gives a Pro reader the short list of what is open, and the full calendar is one click away rather
 * than duplicated here.
 */
@Component({
  selector: "app-pro-incidents-widget",
  imports: [DatePipe, HlmBadge, RouterLink],
  template: `
    @if (_visible()) {
      <section
        class="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
        data-testid="pro-incidents-widget"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold tracking-wide uppercase">Recent incidents</h2>
          <a
            class="text-muted-foreground hover:text-foreground text-xs underline"
            routerLink="/insiden"
            data-testid="pro-incidents-all"
            >All incidents</a
          >
        </div>

        <!-- The window, said out loud. See the class doc: this list is exactly "ongoing, newest
             first", and a reader who assumes a seven-day window would draw the wrong conclusion from
             an older incident not being here. -->
        <p class="text-muted-foreground text-xs" data-testid="pro-incidents-window">
          Ongoing · newest first · showing {{ _incidents().length }}
        </p>

        <ul class="flex flex-col gap-1.5" data-testid="pro-incidents-list">
          @for (incident of _incidents(); track incident.id) {
            <li
              class="border-border flex flex-col gap-1 rounded-lg border px-2.5 py-1.5"
              data-testid="pro-incidents-row"
            >
              <div class="flex items-center gap-2">
                <span hlmBadge [variant]="_severityVariant(incident.severity)">
                  {{ _severityLabel(incident.severity) }}
                </span>
                <span class="min-w-0 flex-1 truncate text-sm" data-testid="pro-incidents-title">
                  {{ incident.title }}
                </span>
                <span
                  class="text-muted-foreground shrink-0 text-xs tabular-nums"
                  data-testid="pro-incidents-since"
                  title="Started {{ incident.startDatetime | date: 'MMM d, y HH:mm' }}"
                >
                  {{ incident.startDatetime | date: "MMM d HH:mm" }}
                </span>
              </div>
              @if (incident.lines.length > 0) {
                <div class="flex flex-wrap items-center gap-1">
                  @for (line of incident.lines; track line.id) {
                    <span hlmBadge variant="neutral" class="gap-1">
                      <span>{{ line.code }}</span>
                    </span>
                  }
                </div>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class ProIncidentsWidgetComponent {
  private readonly store = inject(HomeStore);

  protected readonly _incidents = computed<HomeIncidentItem[]>(() => this.store.recentIncidents());

  /** The widget, or nothing — the store's OWN failure flag, never `HomeStore.hasError()`. */
  protected readonly _visible = computed(
    () => !this.store.incidentsFailed() && this._incidents().length > 0,
  );

  protected _severityLabel(severity: HomeIncidentSeverity): string {
    return severity === "MAJOR" ? "Major" : severity === "MINOR" ? "Minor" : "Other";
  }

  protected _severityVariant(severity: HomeIncidentSeverity) {
    return SEVERITY_VARIANT[severity] ?? "neutral";
  }

  constructor() {
    // 🔴 The opt-in is the whole reason this read is lazy. `graphqlResource` installs an effect that
    // reads its `httpResource` at CALL time, so a store-constructed resource fires the moment the
    // store exists — which would mean every Rider visit, and every store spec that is not about this
    // widget, paid for a request whose answer nothing renders. One explicit call from the surface that
    // draws the data is the only honest gate; the two history reads take the same route.
    this.store.requestIncidentsRead();
  }
}
