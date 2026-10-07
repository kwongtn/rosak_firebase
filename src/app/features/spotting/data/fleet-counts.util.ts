import { VehicleStatus } from "../../../core/graphql/types";
import { VehicleType } from "./spotting.queries";

export interface FleetCountChip {
  key: VehicleStatus | null;
  label: string;
  count: number;
  percent: string;
}

export function fleetCountChips(vehicleTypes: VehicleType[]): FleetCountChip[] {
  const types = vehicleTypes;
  const total = types.reduce((sum, t) => sum + t.vehicleTotalCount, 0);

  const totals: Array<{ key: VehicleStatus; label: string; count: number }> = [
    {
      key: "IN_SERVICE",
      label: "In Service",
      count: types.reduce((sum, t) => sum + t.vehicleStatusInServiceCount, 0),
    },
    {
      key: "NOT_SPOTTED",
      label: "Not Spotted",
      count: types.reduce((sum, t) => sum + t.vehicleStatusNotSpottedCount, 0),
    },
    {
      key: "OUT_OF_SERVICE",
      label: "Out of Service",
      count: types.reduce((sum, t) => sum + t.vehicleStatusOutOfServiceCount, 0),
    },
    {
      key: "DECOMMISSIONED",
      label: "Decommissioned",
      count: types.reduce((sum, t) => sum + t.vehicleStatusDecommissionedCount, 0),
    },
    {
      key: "MARRIED",
      label: "Married",
      count: types.reduce((sum, t) => sum + t.vehicleStatusMarriedCount, 0),
    },
    {
      key: "TESTING",
      label: "Testing",
      count: types.reduce((sum, t) => sum + t.vehicleStatusTestingCount, 0),
    },
    {
      key: "UNKNOWN",
      label: "Unknown",
      count: types.reduce((sum, t) => sum + t.vehicleStatusUnknownCount, 0),
    },
  ];

  const chips: FleetCountChip[] = [
    {
      key: null,
      label: "Total",
      count: total,
      percent: "100",
    },
  ];
  for (const { key, label, count } of totals) {
    if (count > 0) {
      chips.push({
        key,
        label,
        count,
        percent: total === 0 ? "0" : ((count / total) * 100).toPrecision(3),
      });
    }
  }
  return chips;
}
