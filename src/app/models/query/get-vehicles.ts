import { SpottingType } from "../spotting-table/source-type";

export type VehicleStatus =
    | "IN_SERVICE"
    | "NOT_SPOTTED"
    | "OUT_OF_SERVICE"
    | "DECOMMISSIONED"
    | "MARRIED"
    | "TESTING"
    | "UNKNOWN";

export interface VehicleStatusCountType {
    vehicleStatusDecommissionedCount: number;
    vehicleStatusInServiceCount: number;
    vehicleStatusNotSpottedCount: number;
    vehicleStatusOutOfServiceCount: number;
    vehicleStatusTestingCount: number;
    vehicleStatusUnknownCount: number;
    vehicleStatusMarriedCount: number;
    vehicleTotalCount: number;
}

export interface VehicleType extends VehicleStatusCountType {
    id: string;
    internalName: string;
    displayName: string;
    vehicles: Array<{
        id: string;
        identificationNo: string;
        status: VehicleStatus;
        lastSpottingDate: string;
        inServiceSince: string;
        spottingCount: number;
        notes: string;
        nickname: string | null;
        canExpand: boolean;
    }>;
}

export interface GetVehiclesReponse {
    vehicleTypes: Array<VehicleType>;
}

export interface GetLinesAndVehiclesResponse {
    lines: Array<{
        id: string;
        code: string;
        displayName: string;
        vehicleTypes: Array<VehicleType>;
    }>;
}

export interface GetLinesResponse {
    lines: Array<{
        id: string;
        code: string;
        displayName: string;
    }>;
}

export interface LastSpottingsElementStation {
    id: string;
    displayName: string;
}

export interface LastSpottings {
    spottingDate: string;
    status: VehicleStatus;
    type: SpottingType;
    originStation: LastSpottingsElementStation | null;
    destinationStation: LastSpottingsElementStation | null;
    notes: string;
    runNumber: string | null;
    location: {
        accuracy: number;
        altitudeAccuracy: number | null;
        heading: number | null;
        speed: number | null;
        location: [number, number];
        altitude: number | null;
    } | null;
}

export interface GetVehiclesLastSpottingResponse {
    events: Array<LastSpottings>;
}

export interface LastSpottingsTableElement
    extends Omit<LastSpottings, "location"> {
    location: {
        accuracy: number;
        altitudeAccuracy: number | null;
        heading: number | null;
        speed: number | null;
        location: [number, number];
        altitude: number | null;
    } | null;
}

export interface GetVehiclesLastSpottingData {
    vehicles: Array<{
        lastSpottings: Array<LastSpottingsTableElement>;
    }>;
}

export type IncidentSeverityType = "TRIVIA" | "STATUS" | "CRITICAL";

export interface GetVehicleIncidentsResponse {
    vehicleIncidents: Array<{
        order: number;
        date: string;
        severity: IncidentSeverityType;
        brief: string | null;
        title: string;
        isLast: boolean;
    }>;
}
