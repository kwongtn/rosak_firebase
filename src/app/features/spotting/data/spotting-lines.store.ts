import { Injectable, computed } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { LINES_QUERY, Line, LinesQueryData } from "./spotting.queries";

/**
 * App-lifetime cache for the line list shared by the home report form and every spotting page.
 * This keeps one `Lines` fetch alive across home/spotting navigations, avoiding duplicate
 * requests, and must outlive the spotting shell now that `ReusableRouteStrategy` keeps pages
 * mounted across navigations (`data: { reuse: true }`); a route-scoped store would leave a
 * detached page with stale data and a dead retry loop after its injector was destroyed.
 */
@Injectable({ providedIn: "root" })
export class SpottingLinesStore {
  private readonly resource = graphqlResource<LinesQueryData>(() => ({ query: LINES_QUERY }));

  readonly isLoading = this.resource.isLoading;
  readonly hasError = this.resource.hasError;

  /** Stable order (by code) — the backend's own default `lines` ordering isn't guaranteed. */
  readonly lines = computed<Line[]>(() =>
    [...(this.resource.data()?.lines ?? [])].sort((a, b) => a.code.localeCompare(b.code)),
  );

  readonly firstLineId = computed<string | undefined>(() => this.lines()[0]?.id);

  lineById(id: string): Line | undefined {
    return this.lines().find((line) => line.id === id);
  }
}
