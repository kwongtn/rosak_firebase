/* ---------------------------------------------------------------------- *
 * medias — the paginated, orderable connection (Relay cursor pagination).
 * Deliberately NOT `mediasGroupByPeriod` (what the old app used): that field has no pagination
 * argument at all — the resolver loads and returns every media row that has ever existed on
 * every call, which is exactly the "load everything at once" behavior this rewrite is meant to
 * avoid. See docs/frontend-map/gallery.md's rewrite notes for the full backend gap writeup.
 * ---------------------------------------------------------------------- */

export const MEDIAS_QUERY = /* GraphQL */ `
  query MediasFeed($first: Int!, $after: String) {
    medias(first: $first, after: $after, order: { created: DESC }) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        cursor
        node {
          id
          createdDate
          width
          height
          file {
            url
          }
          uploader {
            nickname
          }
        }
      }
    }
  }
`;

export interface MediasFeedQueryVars {
  first: number;
  after?: string | null;
}

export interface MediaNode {
  id: string;
  createdDate: string;
  width: number;
  height: number;
  file: { url: string } | null;
  uploader: { nickname: string };
}

export interface MediasFeedQueryData {
  medias: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ cursor: string; node: MediaNode }>;
  };
}

/* ---------------------------------------------------------------------- *
 * mediasGroupByPeriod(type: YEAR) — used ONLY for the year-slider's tick labels and per-year
 * counts (a cheap, coarse-grained call: one row per year, `medias` sub-field intentionally not
 * requested so the backend's per-bucket media aggregation doesn't get serialized into the
 * response). Never used to actually load images — that's `medias`, above.
 * ---------------------------------------------------------------------- */

export const MEDIA_YEAR_COUNTS_QUERY = /* GraphQL */ `
  query MediaYearCounts {
    mediasGroupByPeriod(type: YEAR) {
      year
      count
    }
  }
`;

export interface MediaYearCount {
  year: number;
  count: number;
}

export interface MediaYearCountsQueryData {
  mediasGroupByPeriod: MediaYearCount[];
}
