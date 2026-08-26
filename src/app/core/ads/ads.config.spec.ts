import { ADS_CONFIG, resolveAdSlot, type AdSlotKey } from "./ads.config";

describe("ADS_CONFIG", () => {
  it("uses the shared publisher client id", () => {
    expect(ADS_CONFIG.client).toBe("ca-pub-3632544969292535");
  });

  it("maps every slot key to a non-empty string unit id", () => {
    const keys = Object.keys(ADS_CONFIG.slots) as AdSlotKey[];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(typeof ADS_CONFIG.slots[key]).toBe("string");
      expect(ADS_CONFIG.slots[key].length).toBeGreaterThan(0);
    }
  });

  it("reuses the single 'mlptf' unit across every slot", () => {
    expect(new Set(Object.values(ADS_CONFIG.slots))).toEqual(new Set(["3724291191"]));
  });
});

describe("resolveAdSlot", () => {
  // `enabled` is fixed at module load, so each test sets it explicitly; `resolveAdSlot` reads it
  // per call, and `afterEach` restores the original to keep tests order-independent.
  const config = ADS_CONFIG as { enabled: boolean };
  let original: boolean;

  beforeEach(() => {
    original = config.enabled;
  });

  afterEach(() => {
    config.enabled = original;
  });

  it("returns the unit id for a known slot key when enabled", () => {
    config.enabled = true;
    expect(resolveAdSlot("footerEnd")).toBe("3724291191");
    expect(resolveAdSlot("gallerySidebar")).toBe("3724291191");
  });

  it("returns undefined for an unknown slot key", () => {
    config.enabled = true;
    expect(resolveAdSlot("notARealSlot" as AdSlotKey)).toBeUndefined();
  });

  it("returns undefined when ads are disabled", () => {
    config.enabled = false;
    expect(resolveAdSlot("footerEnd")).toBeUndefined();
  });
});
