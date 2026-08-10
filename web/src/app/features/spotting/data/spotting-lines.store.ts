import { Injectable, computed } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { LINES_QUERY, Line, LinesQueryData } from "./spotting.queries";

/**
 * Route-scoped store (provided on the /spotting shell route) for the one piece of data every
 * spotting page needs: the line list. One fetch shared by the redirect page, the line-overview
 * header, and the report form's line dropdown — see spotting.routes.ts for the providers wiring.
 */
@Injectable()
export class SpottingLinesStore {
    private readonly resource = graphqlResource<LinesQueryData>(() => ({ query: LINES_QUERY }));

    readonly isLoading = this.resource.isLoading;
    readonly hasError = this.resource.hasError;

    /** Stable order (by code) — the backend's own default `lines` ordering isn't guaranteed. */
    readonly lines = computed<Line[]>(() =>
        [...(this.resource.data()?.lines ?? [])].sort((a, b) => a.code.localeCompare(b.code))
    );

    readonly firstLineId = computed<string | undefined>(() => this.lines()[0]?.id);

    lineById(id: string): Line | undefined {
        return this.lines().find((line) => line.id === id);
    }
}
