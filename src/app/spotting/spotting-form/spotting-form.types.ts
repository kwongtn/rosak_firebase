import { VehicleStatus } from "src/app/models/query/get-vehicles";

export interface VehicleFormOption {
    name: any;
    value: any;
    disabled?: boolean;
    status: VehicleStatus;
}
