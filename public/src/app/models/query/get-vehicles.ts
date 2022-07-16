type VehicleStatus =
    | "IN_SERVICE"
    | "NOT_SPOTTED"
    | "DECOMMISSIONED"
    | "TESTING"
    | "UNKNOWN";

export interface GetVehiclesReponse {
    vehicleTypes: Array<{
        id: string;
        internalName: string;
        displayName: string;
        vehicles: Array<{
            id: string;
            identificationNo: string;
            status: VehicleStatus;
            lastSpottings: Array<{ spottingDate: string }>;
            inServiceSince: string;
            spottingCount: number;
            notes: string;
        }>;
    }>;
}
