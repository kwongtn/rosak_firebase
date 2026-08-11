export interface LayerCheckbox {
  label: string;
  value: string;
  endpoint: string;
  /** Doc link shown next to the checkbox. */
  source: string;
}

/**
 * Ported from the old PanelSelectionService's hardcoded checkbox config
 * (panel-selection.service.ts). "checked" state now lives separately, per selection instance
 * (see LayerSelectionService), rather than mutated in place on this static config.
 */
export const REALTIME_LAYER_CHECKBOXES: LayerCheckbox[] = [
  {
    label: "myBAS Johor Bahru",
    value: "mybas-johor",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-johor",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-johor-bahru",
  },
  {
    label: "KTMB",
    value: "ktmb",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#ktmb",
  },
  {
    label: "RapidBus KL",
    value: "prasarana-rapid-bus-kl",
    endpoint:
      "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
  },
  {
    label: "RapidBus MRT Feeder",
    value: "prasarana-rapid-bus-mrtfeeder",
    endpoint:
      "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-mrtfeeder",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
  },
  {
    label: "RapidBus Kuantan",
    value: "prasarana-rapid-bus-kuantan",
    endpoint:
      "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kuantan",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
  },
  {
    label: "RapidBus Penang",
    value: "prasarana-rapid-bus-penang",
    endpoint:
      "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-penang",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
  },
  // The following BAS.MY sources were added to data.gov.my after this checkbox list was first
  // written — see https://developer.data.gov.my/realtime-api/gtfs-realtime for the live list.
  {
    label: "myBAS Kangar",
    value: "mybas-kangar",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kangar",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-kangar",
  },
  {
    label: "myBAS Alor Setar",
    value: "mybas-alor-setar",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-alor-setar",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-alor-setar",
  },
  {
    label: "myBAS Kota Bharu",
    value: "mybas-kota-bharu",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kota-bharu",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-kota-bharu",
  },
  {
    label: "myBAS Kuala Terengganu",
    value: "mybas-kuala-terengganu",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kuala-terengganu",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-kuala-terengganu",
  },
  {
    label: "myBAS Ipoh",
    value: "mybas-ipoh",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-ipoh",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-ipoh",
  },
  {
    // 2 separate operators serve Seremban; data.gov.my exposes them as distinct feeds and
    // recommends querying both for full coverage.
    label: "myBAS Seremban (Operator A)",
    value: "mybas-seremban-a",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-seremban-a",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-seremban",
  },
  {
    label: "myBAS Seremban (Operator B)",
    value: "mybas-seremban-b",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-seremban-b",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-seremban",
  },
  {
    label: "myBAS Melaka",
    value: "mybas-melaka",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-melaka",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-melaka",
  },
  {
    label: "myBAS Kuching",
    value: "mybas-kuching",
    endpoint: "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-kuching",
    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#basmy-kuching",
  },
];

export const STOPS_LAYER_CHECKBOXES: LayerCheckbox[] = [
  {
    label: "myBAS Johor Bahru",
    value: "mybas-johor",
    endpoint: "https://api.data.gov.my/gtfs-static/mybas-johor",
    source: "https://developer.data.gov.my/realtime-api/gtfs-static#mybas-johor-bahru",
  },
  {
    label: "KTMB",
    value: "ktmb",
    endpoint: "https://api.data.gov.my/gtfs-static/ktmb",
    source: "https://developer.data.gov.my/realtime-api/gtfs-static#ktmb",
  },
  {
    label: "RapidBus KL",
    value: "prasarana-rapid-bus-kl",
    endpoint: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl",
    source: "https://developer.data.gov.my/realtime-api/gtfs-static#prasarana",
  },
  {
    label: "RapidBus MRT Feeder",
    value: "prasarana-rapid-bus-mrtfeeder",
    endpoint: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder",
    source: "https://developer.data.gov.my/realtime-api/gtfs-static#prasarana",
  },
  {
    label: "RapidRail KL",
    value: "prasarana-rapid-rail-kl",
    endpoint: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl",
    source: "https://developer.data.gov.my/realtime-api/gtfs-static#prasarana",
  },
  {
    label: "RapidBus Kuantan",
    value: "prasarana-rapid-bus-kuantan",
    endpoint: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kuantan",
    source: "https://developer.data.gov.my/realtime-api/gtfs-static#prasarana",
  },
  {
    label: "RapidBus Penang",
    value: "prasarana-rapid-bus-penang",
    endpoint: "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-penang",
    source: "https://developer.data.gov.my/realtime-api/gtfs-static#prasarana",
  },
];

export const RAILWAY_LINE_SOURCE = {
  label: "Malaysia Railway",
  source: "https://www.openstreetmap.org/",
};
