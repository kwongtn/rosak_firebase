export type VehicleStatus =
    | "IN_SERVICE"
    | "NOT_IN_SERVICE"
    | "DECOMMISSIONED"
    | "TESTING";

export interface VehicleFormOption {
    name: any;
    value: any;
    disabled?: boolean;
    status: VehicleStatus;
}
