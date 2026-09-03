export interface PublicSocialMediaLinkLine {
  id: string;
  code: string;
  displayName: string;
}
export interface PublicSocialMediaLinkVehicle {
  id: string;
  identificationNo: string;
}
export interface PublicSocialMediaLinkStation {
  id: string;
  displayName: string;
}
/** One submitted link (the connection's `node`). `status` carries the approval
 * state (PENDING_APPROVAL for user submissions, LIVE for admin ones — Task 10);
 * `completed` keeps the pre-status contract the console uses. */
export interface PublicSocialMediaLink {
  id: string;
  url: string;
  title: string;
  created: string;
  completed: boolean;
  status?: string | null;
  lines: PublicSocialMediaLinkLine[];
  vehicles: PublicSocialMediaLinkVehicle[];
  stations: PublicSocialMediaLinkStation[];
}
export interface PublicSocialMediaLinkEdge {
  node: PublicSocialMediaLink;
  cursor: string;
}
export interface PublicSocialMediaLinkPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
export interface PublicSocialMediaLinksConnection {
  edges: PublicSocialMediaLinkEdge[];
  pageInfo: PublicSocialMediaLinkPageInfo;
}
export interface PublicSocialMediaLinksQueryData {
  publicSocialMediaLinks: PublicSocialMediaLinksConnection;
}
/**
 * Shared paginated links query (Task 10 keyset cursor + Task 16 infinite scroll).
 * The public tab passes only `first`/`after`; the incident card's continuation
 * pages pass `incidentId` with the cursor it got from the nested
 * `links(first, after)` scalar field — same ordering (created DESC, id DESC),
 * same cursor format (see rosak_backend incident/schema/keyset.py). `lineId`
 * stays for the spotting line-details panel (first page only). `mine` (Task 23)
 * switches to the caller's own submissions (status-independent); the backend
 * returns an empty page for anonymous callers — the profile feature always
 * sends an idToken header alongside it (mirrors my-spottings, never
 * graphqlResource).
 */
export const PUBLIC_SOCIAL_MEDIA_LINKS_QUERY = `
  query PublicSocialMediaLinks(
    $first: Int = 20
    $after: String
    $lineId: ID
    $incidentId: ID
    $mine: Boolean
  ) {
    publicSocialMediaLinks(
      first: $first
      after: $after
      lineId: $lineId
      incidentId: $incidentId
      mine: $mine
    ) {
      edges {
        node {
          id
          url
          title
          created
          status
          completed
          lines { id code displayName }
          vehicles { id identificationNo }
          stations { id displayName }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface PublicSocialMediaLinksVars {
  first?: number;
  after?: string | null;
  lineId?: string | null;
  incidentId?: string | null;
  mine?: boolean | null;
}
