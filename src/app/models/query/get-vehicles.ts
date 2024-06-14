import { SpottingType } from "src/app/pipes/spotting-type/spotting-type.pipe";
import {
    VehicleStatus,
} from "src/app/pipes/vehicle-status/vehicle-status.pipe";

export type LineStatus =
    | "TESTING"
    | "DEFUNCT"
    | "ACTIVE"
    | "PARTIAL_ACTIVE"
    | "PARTIAL_DISRUPTION"
    | "TOTAL_DISRUPTION";

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
        incidentCount: number;
        wheelStatus: string;
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
        status: LineStatus;
    }>;
}

export interface LastSpottingsElementStation {
    id: string;
    displayName: string;
}

export interface LastSpottings {
    id: string;
    spottingDate: string;
    status: VehicleStatus;
    type: SpottingType;
    originStation: LastSpottingsElementStation | null;
    destinationStation: LastSpottingsElementStation | null;
    notes: string;
    runNumber: string | null;
    mediaCount: number;
    isMine: boolean;
    wheelStatus: string;
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
