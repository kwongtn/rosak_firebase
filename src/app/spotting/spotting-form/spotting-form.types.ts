export type VehicleStatus =
    | "IN_SERVICE"
    | "NOT_IN_SERVICE"
    | "DECOMMISSIONED"
    | "TESTING";

export interface VehicleFormOption {
    name: string;
    value: string;
    disabled?: boolean;
    status: VehicleStatus;
}
