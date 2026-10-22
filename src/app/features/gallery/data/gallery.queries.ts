/* ---------------------------------------------------------------------- *
 * medias — the paginated, orderable connection (Relay cursor pagination).
 * Deliberately NOT `mediasGroupByPeriod` (what the old app used) for the photos: that field has
 * no pagination argument at all — selecting its `medias` sub-field returns every media row that
 * has ever existed in one call, which is exactly the "load everything at once" behavior this
 * rewrite is meant to avoid. See archive/frontend-map/gallery.md's rewrite notes for the full
 * backend gap writeup.
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
  /** Null when the photo is attached to an anonymous spotting and the viewer is neither the
   * uploader nor an admin: the photo still shows, just without a name. */
  uploader: { nickname: string } | null;
}

export interface MediasFeedQueryData {
  medias: {
    totalCount: number | null;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ cursor: string; node: MediaNode }>;
  };
}

/* ---------------------------------------------------------------------- *
 * media(id) — one photo, for a shared /gallery/:mediaId link. `id` is the Relay global id the feed
 * hands out (`MediaNode.id`), passed through verbatim; a raw database id is not accepted. `null`
 * means there is no such photo (unknown, malformed or removed). Same selection as one `medias`
 * node above, so `data.media` is a `MediaNode`.
 * ---------------------------------------------------------------------- */

export const MEDIA_BY_ID_QUERY = /* GraphQL */ `
  query MediaById($id: ID!) {
    media(id: $id) {
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
`;

export interface MediaByIdQueryVars {
  id: string;
}

export interface MediaByIdQueryData {
  media: MediaNode | null;
}

/* ---------------------------------------------------------------------- *
 * mediasGroupByPeriod(type: YEAR) — used ONLY for the year-slider's tick labels and per-year
 * counts (a GROUP BY aggregate, kept off the SSR path — see GalleryPage.yearCountsResource:
 * one row per year, `medias` sub-field intentionally not requested so the backend's per-bucket
 * media aggregation doesn't get serialized into the response). Never used to actually load
 * images — that's `medias`, above.
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
