/**
 * GraphQL mutations for the home feed's links — the inline submit and the three link vote
 * operations. Field names are copied verbatim from the deployed Strawberry schema. Split
 * out of the former monolithic `home.queries.ts`; the line-status report mutation lives
 * with the history module it belongs to (`home-history.queries.ts`).
 */

import type { VoteAcknowledgement } from "../../insiden/vote-button/vote-state.util";
import type { FeedLink } from "./home-feed-items";
import type { PassengerStatus } from "./home.queries";

export const SUBMIT_FEED_LINK_MUTATION = /* GraphQL */ `
  mutation SubmitFeedLink($input: FeedLinkInput!) {
    submitFeedLink(input: $input) {
      ok
      isDuplicate
      duplicateOfId
      userVote
      link {
        id
        url
        normalizedUrl
        title
        created
        # The sub-select MIRRORS the FeedLink node selection, which is why it carries
        # everything FeedLink declares: the payload's own type says the link IS a
        # FeedLink, so a partial selection would make that type a lie, and any host
        # that ever renders or optimistically patches this row (a link whose event
        # time the user just chose, a thread wrapper reading counts) would find a hole
        # in it. The feed is NOT prepended from here: the submit box emits "submitted"
        # and the page calls store.reloadAll(), which re-reads the collapsed feed — so
        # nothing renders this payload today and the shape is a contract, not a
        # shortcut. A brand-new link is by definition a ROOT of its own: parentId
        # null, isThreadRoot true, sublinkCount 0, sublinks []. The four-level
        # nesting mirrors FEED_QUERY exactly, because the payload's declared type
        # IS FeedLink and FeedLink.sublinks is a required four-level tree — a
        # one-level mirror here would make the type a lie, and the day a host
        # renders this payload through the recursive thread wrapper it would render
        # a hole. The wire cost is one [] per level on a link that has no
        # children yet.
        #
        # The three EDIT ROUND-TRIP relations are mirrored for the same reason and
        # carry the same minimal identifying pairs: FeedLink declares all three as
        # REQUIRED, so a payload without them describes a link the server never
        # returned — and the tags are precisely what an edit round-trip reads (see the
        # FeedLink doc comment; SocialMediaLinkInput is replace-not-patch, so an
        # absent relation is a blanked one).
        occurredAt
        parentId
        isThreadRoot
        sublinkCount
        sublinks {
          id
          url
          title
          created
          occurredAt
          parentId
          isThreadRoot
          sublinkCount
          status
          completed
          isAutomated
          voteScore
          userVote
          voteBreakdown {
            upvotes
            downvotes
          }
          lines {
            id
            code
            displayName
          }
          # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
          # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
          # is replace-not-patch, so a payload that omits a relation does not leave it
          # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
          # on purpose: the Vehicle scalar also carries vehicleType, incidents,
          # spottings and spottingTrends(...), so selecting all of it would multiply
          # payload and resolver fan-out on every row of every feed page.
          vehicles {
            id
            identificationNo
          }
          stations {
            id
            displayName
          }
          categories {
            id
            name
          }
          user {
            shortId
            nickname
          }
          sublinks {
            id
            url
            title
            created
            occurredAt
            parentId
            isThreadRoot
            sublinkCount
            status
            completed
            isAutomated
            voteScore
            userVote
            voteBreakdown {
              upvotes
              downvotes
            }
            lines {
              id
              code
              displayName
            }
            # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
            # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
            # is replace-not-patch, so a payload that omits a relation does not leave it
            # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
            # on purpose: the Vehicle scalar also carries vehicleType, incidents,
            # spottings and spottingTrends(...), so selecting all of it would multiply
            # payload and resolver fan-out on every row of every feed page.
            vehicles {
              id
              identificationNo
            }
            stations {
              id
              displayName
            }
            categories {
              id
              name
            }
            user {
              shortId
              nickname
            }
            sublinks {
              id
              url
              title
              created
              occurredAt
              parentId
              isThreadRoot
              sublinkCount
              status
              completed
              isAutomated
              voteScore
              userVote
              voteBreakdown {
                upvotes
                downvotes
              }
              lines {
                id
                code
                displayName
              }
              # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
              # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
              # is replace-not-patch, so a payload that omits a relation does not leave it
              # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
              # on purpose: the Vehicle scalar also carries vehicleType, incidents,
              # spottings and spottingTrends(...), so selecting all of it would multiply
              # payload and resolver fan-out on every row of every feed page.
              vehicles {
                id
                identificationNo
              }
              stations {
                id
                displayName
              }
              categories {
                id
                name
              }
              user {
                shortId
                nickname
              }
              sublinks {
                id
                url
                title
                created
                occurredAt
                parentId
                isThreadRoot
                sublinkCount
                status
                completed
                isAutomated
                voteScore
                userVote
                voteBreakdown {
                  upvotes
                  downvotes
                }
                lines {
                  id
                  code
                  displayName
                }
                # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
                # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
                # is replace-not-patch, so a payload that omits a relation does not leave it
                # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
                # on purpose: the Vehicle scalar also carries vehicleType, incidents,
                # spottings and spottingTrends(...), so selecting all of it would multiply
                # payload and resolver fan-out on every row of every feed page.
                vehicles {
                  id
                  identificationNo
                }
                stations {
                  id
                  displayName
                }
                categories {
                  id
                  name
                }
                user {
                  shortId
                  nickname
                }
              }
            }
          }
        }
        # Also the approval/provenance pair, which the card renders as its Pending
        # pill and Official chip — a link submitted through the feed box lands
        # PENDING_APPROVAL, so a payload that omitted these described a link that
        # reads as already approved.
        status
        completed
        isAutomated
        voteScore
        userVote
        voteBreakdown {
          upvotes
          downvotes
        }
        lines {
          id
          code
          displayName
        }
        # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
        # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
        # is replace-not-patch, so a payload that omits a relation does not leave it
        # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
        # on purpose: the Vehicle scalar also carries vehicleType, incidents,
        # spottings and spottingTrends(...), so selecting all of it would multiply
        # payload and resolver fan-out on every row of every feed page.
        vehicles {
          id
          identificationNo
        }
        stations {
          id
          displayName
        }
        categories {
          id
          name
        }
        user {
          shortId
          nickname
        }
      }
    }
  }
`;

/** `FeedLinkInput` — the home feed's inline submit box. Mirrors the backend input's
 *  optionality: every field past `url` may be omitted. */
interface FeedLinkInput {
  url: string;
  title?: string | null;
  /** "When did this happen". Backend `Maybe[datetime | None]`: OMIT or send `null` and the
   *  backend stamps the submission instant; send a value and it is stored verbatim and becomes
   *  the leading key of every feed ordering. There is deliberately NO update path here (the
   *  feed has no edit — a repeat submission of the same canonical URL returns the existing
   *  row untouched), so unlike `SocialMediaLinkInput.occurredAt` there is no "reset to
   *  submitted" state to express. Naive local wall time: build the value with
   *  `occurredAtInputToIso` (features/insiden/data/link-occurred-at.util.ts), never
   *  `new Date(...).toISOString()`, which would convert to UTC and shift it 8 hours. */
  occurredAt?: string | null;
  lineIds?: string[];
  stationIds?: string[];
  status?: PassengerStatus | null;
  delayMinutes?: number | null;
  notes?: string | null;
}

export interface SubmitFeedLinkVars {
  input: FeedLinkInput;
}

export interface SubmitFeedLinkData {
  submitFeedLink: {
    ok: boolean;
    link: FeedLink;
    isDuplicate: boolean;
    duplicateOfId: number | null;
    userVote: number;
  };
}

/* ---------------------------------------------------------------------- *
 * Link vote mutations. 🔴 They acknowledge with the vote state the write
 * produced — `userVote` / `voteScore` / `upvotes` / `downvotes` — and NOT with a
 * bare `ok`. A client given only `ok` has to project the new score itself, and
 * that projection then races its own echo (the host writes the value back down
 * as `userVote`, which re-seeds the control) plus any other voter, so the score
 * visibly snaps back to a pre-click number. Repainting from this response makes
 * the mutation the single source of truth — see `voteStateFromAcknowledgement`.
 * ---------------------------------------------------------------------- */

export const UPVOTE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation UpvoteSocialMediaLink($id: ID!) {
    upvoteSocialMediaLink(socialMediaLinkId: $id) {
      ok
      userVote
      voteScore
      upvotes
      downvotes
    }
  }
`;

export const DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation DownvoteSocialMediaLink($id: ID!) {
    downvoteSocialMediaLink(socialMediaLinkId: $id) {
      ok
      userVote
      voteScore
      upvotes
      downvotes
    }
  }
`;

export const REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION = /* GraphQL */ `
  mutation RemoveSocialMediaLinkVote($id: ID!) {
    removeSocialMediaLinkVote(socialMediaLinkId: $id) {
      ok
      userVote
      voteScore
      upvotes
      downvotes
    }
  }
`;

export interface SocialMediaLinkVoteVars {
  id: string;
}

/** The `VoteMutationPayload` the three link vote mutations return — the same type
 * the incident and chronology vote mutations acknowledge with. */
export interface SocialMediaLinkVotePayload extends VoteAcknowledgement {
  ok: boolean;
}

export interface SocialMediaLinkVoteData {
  upvoteSocialMediaLink?: SocialMediaLinkVotePayload;
  downvoteSocialMediaLink?: SocialMediaLinkVotePayload;
  removeSocialMediaLinkVote?: SocialMediaLinkVotePayload;
}
