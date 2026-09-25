import { ActivatedRouteSnapshot, DetachedRouteHandle, Route } from "@angular/router";
import { describe, expect, it } from "vitest";
import { MAX_REUSABLE_ROUTE_HANDLES, ReusableRouteStrategy } from "./reusable-route.strategy";

interface SnapshotFixture {
  pathFromRoot: SnapshotFixture[];
  routeConfig: Route | null;
  params: Record<string, string>;
  data: Record<string, unknown>;
}

/** A deliberately small snapshot fixture: the strategy only reads these four fields. */
function makeSnapshot(
  routeConfig: Route | null,
  params: Record<string, string> = {},
  data: Record<string, unknown> = {},
  ancestors: SnapshotFixture[] = [],
): ActivatedRouteSnapshot {
  const snapshot: SnapshotFixture = {
    pathFromRoot: [],
    routeConfig,
    params,
    data,
  };
  snapshot.pathFromRoot = [...ancestors, snapshot];
  return snapshot as unknown as ActivatedRouteSnapshot;
}

function asFixture(snapshot: ActivatedRouteSnapshot): SnapshotFixture {
  return snapshot as unknown as SnapshotFixture;
}

const rootRoute: Route = { path: "" };
const spottingRoute: Route = { path: "spotting" };
const shellRoute: Route = { path: "" };
const overviewRoute: Route = { path: ":lineId" };
const detailsParentRoute: Route = { path: ":lineId" };
const detailsRoute: Route = { matcher: () => null };
const vehicleRoute: Route = { path: ":lineId/vehicle/:vehicleId" };

function makeBaseChain() {
  const root = asFixture(makeSnapshot(rootRoute));
  const spotting = asFixture(makeSnapshot(spottingRoute, {}, {}, [root]));
  const shell = asFixture(makeSnapshot(shellRoute, {}, {}, [root, spotting]));
  return { root, spotting, shell };
}

function makeOverview(base: ReturnType<typeof makeBaseChain>, lineId: string) {
  return makeSnapshot(overviewRoute, { lineId }, { reuse: true }, [
    base.root,
    base.spotting,
    base.shell,
  ]);
}

function makeDetails(base: ReturnType<typeof makeBaseChain>, lineId: string, tab?: string) {
  const parent = asFixture(
    makeSnapshot(detailsParentRoute, { lineId }, {}, [base.root, base.spotting, base.shell]),
  );
  const params: Record<string, string> = tab === undefined ? { lineId } : { lineId, tab };
  return makeSnapshot(detailsRoute, params, { reuse: true }, [
    base.root,
    base.spotting,
    base.shell,
    parent,
  ]);
}

function makeVehicle(base: ReturnType<typeof makeBaseChain>, lineId: string, vehicleId: string) {
  return makeSnapshot(vehicleRoute, { lineId, vehicleId }, { reuse: true }, [
    base.root,
    base.spotting,
    base.shell,
  ]);
}

describe("reusable-route", () => {
  it("keys route chains by config identity and declared path params", () => {
    const strategy = new ReusableRouteStrategy();
    const base = makeBaseChain();
    const overviewX = makeOverview(base, "X");
    const overviewXAgain = makeOverview(base, "X");
    const overviewY = makeOverview(base, "Y");
    const detailsX = makeDetails(base, "X");
    const detailsXTabA = makeDetails(base, "X", "tab-a");
    const detailsXTabB = makeDetails(base, "X", "tab-b");
    const vehicleA = makeVehicle(base, "X", "A");
    const vehicleB = makeVehicle(base, "X", "B");

    expect(strategy.key(overviewX)).toBe(strategy.key(overviewXAgain));
    expect(strategy.key(overviewX)).not.toBe(strategy.key(overviewY));
    expect(strategy.key(overviewX)).not.toBe(strategy.key(detailsX));
    expect(strategy.key(detailsX)).toBe(strategy.key(detailsXTabA));
    expect(strategy.key(detailsXTabA)).toBe(strategy.key(detailsXTabB));
    expect(strategy.key(detailsX)).not.toBe(strategy.key(vehicleA));
    expect(strategy.key(vehicleA)).not.toBe(strategy.key(vehicleB));
  });

  it("only detaches routes explicitly marked for reuse", () => {
    const strategy = new ReusableRouteStrategy();
    const base = makeBaseChain();

    expect(strategy.shouldDetach(makeOverview(base, "X"))).toBe(true);
    expect(strategy.shouldDetach(makeDetails(base, "X"))).toBe(true);
    expect(strategy.shouldDetach(makeVehicle(base, "X", "A"))).toBe(true);
    expect(strategy.shouldDetach(makeSnapshot(rootRoute))).toBe(false);
    expect(strategy.shouldDetach(makeSnapshot(rootRoute, {}, { reuse: false }))).toBe(false);
  });

  it("stores, attaches, and retrieves a handle without deleting it during retrieve", () => {
    const strategy = new ReusableRouteStrategy();
    const snapshot = makeOverview(makeBaseChain(), "X");
    const handle = {} as DetachedRouteHandle;

    strategy.store(snapshot, handle);

    expect(strategy.shouldAttach(snapshot)).toBe(true);
    expect(strategy.retrieve(snapshot)).toBe(handle);
    expect(strategy.shouldAttach(snapshot)).toBe(true);
  });

  it("deletes a key when RouterOutlet stores null after retrieve", () => {
    const strategy = new ReusableRouteStrategy();
    const snapshot = makeOverview(makeBaseChain(), "X");

    strategy.store(snapshot, {} as DetachedRouteHandle);
    strategy.store(snapshot, null);

    expect(strategy.shouldAttach(snapshot)).toBe(false);
    expect(strategy.retrieve(snapshot)).toBeNull();
  });

  it("evicts the oldest handle once the cap is exceeded", () => {
    const strategy = new ReusableRouteStrategy();
    const base = makeBaseChain();
    const snapshots = Array.from({ length: MAX_REUSABLE_ROUTE_HANDLES + 1 }, (_, index) =>
      makeVehicle(base, "X", `vehicle-${index}`),
    );
    const handles = snapshots.map(() => ({}) as DetachedRouteHandle);

    snapshots.forEach((snapshot, index) => strategy.store(snapshot, handles[index]));

    expect(strategy.shouldAttach(snapshots[0])).toBe(false);
    expect(strategy.shouldAttach(snapshots[1])).toBe(true);
    expect(strategy.shouldAttach(snapshots[MAX_REUSABLE_ROUTE_HANDLES])).toBe(true);
    expect(strategy.retrieve(snapshots[MAX_REUSABLE_ROUTE_HANDLES])).toBe(
      handles[MAX_REUSABLE_ROUTE_HANDLES],
    );
  });

  it("retains BaseRouteReuseStrategy's config-identity reuse behavior", () => {
    const strategy = new ReusableRouteStrategy();
    const base = makeBaseChain();

    expect(strategy.shouldReuseRoute(makeOverview(base, "X"), makeOverview(base, "Y"))).toBe(true);
    expect(strategy.shouldReuseRoute(makeOverview(base, "X"), makeVehicle(base, "X", "A"))).toBe(
      false,
    );
  });
});
