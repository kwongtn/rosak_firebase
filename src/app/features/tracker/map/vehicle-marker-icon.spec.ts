import { createVehicleMarkerElement, iconModeForSourceKey } from "./vehicle-marker-icon";

describe("iconModeForSourceKey", () => {
  it("makes KTMB a train and every other source a bus", () => {
    expect(iconModeForSourceKey("ktmb")).toBe("train");
    expect(iconModeForSourceKey("mrtfeeder")).toBe("bus");
    expect(iconModeForSourceKey("")).toBe("bus");
  });
});

describe("createVehicleMarkerElement", () => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  it("wraps one decorative SVG glyph in a round marker", () => {
    const marker = createVehicleMarkerElement("bus");
    const svg = marker.querySelector("svg");

    expect(marker.tagName).toBe("DIV");
    expect(marker.children).toHaveLength(1);
    expect(svg?.namespaceURI).toBe(SVG_NS);
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("draws a different glyph for a train and a bus, in the SVG namespace", () => {
    const train = createVehicleMarkerElement("train").querySelector("svg");
    const bus = createVehicleMarkerElement("bus").querySelector("svg");

    expect(train?.children).toHaveLength(8);
    expect(bus?.children).toHaveLength(4);
    for (const shape of [
      ...Array.from(train?.children ?? []),
      ...Array.from(bus?.children ?? []),
    ]) {
      expect(shape.namespaceURI).toBe(SVG_NS);
    }
    expect(train?.querySelector("rect")?.getAttribute("height")).toBe("14");
    expect(bus?.querySelector("rect")?.getAttribute("height")).toBe("12");
  });

  it("builds a fresh element on every call", () => {
    expect(createVehicleMarkerElement("bus")).not.toBe(createVehicleMarkerElement("bus"));
  });
});
