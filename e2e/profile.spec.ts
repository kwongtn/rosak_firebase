import { E2E_UID, loginAs } from "./helpers/auth";
import {
  configureMock,
  expect,
  recordedCalls,
  routeGraphQLToMock,
  test,
} from "./helpers/mock-graphql";

/**
 * /profile has no page of its own: its guard waits for the Firebase session and redirects to the
 * signed-in user's /profile/:uid, whose owner read is the one that carries the token.
 */

test("USER: /profile redirects to the own profile and reads the owner's data with the token", async ({
  page,
}) => {
  await routeGraphQLToMock(page);
  await configureMock({
    GetUserData: {
      user: {
        nickname: "Night Spotter",
        spottingsCount: 3,
        mediaCount: 1,
        spottingDataPublic: true,
        spottingTrends: [],
        withMostEntriesMonth: null,
        withMostEntriesDay: null,
        favouriteVehicles: [],
      },
    },
    GetMyVotesCast: { myVotesCast: 7 },
    GetMyEvents: { events: [] },
    GetFleetProgress: { user: { favouriteVehicles: [] } },
    PublicSocialMediaLinks: {
      publicSocialMediaLinks: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
    },
  });
  const token = await loginAs(page);

  await page.goto("/profile");

  await expect(page).toHaveURL(new RegExp(`/profile/${E2E_UID}$`));
  await expect(page.getByText("Night Spotter").first()).toBeVisible();
  const ownerRead = (await recordedCalls()).find((c) => c.operationName === "GetUserData");
  expect(ownerRead?.authKey).toBe(token);
});
