import { Injectable, computed } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { LINES_QUERY, Line, LinesQueryData } from "./spotting.queries";

/**
 * App-lifetime cache for the line list shared by the home report form and every spotting page, so
 * one `Lines` fetch serves both entry points instead of refetching on every navigation. It is
 * deliberately root-provided: `ReusableRouteStrategy` keeps page components mounted after
 * navigation (`data: { reuse: true }`), and route injectors are not destroyed on deactivation, so a
 * route-scoped store would still be alive but would hand a kept-alive page an instance tied to a
 * route subtree that no longer exists.
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
