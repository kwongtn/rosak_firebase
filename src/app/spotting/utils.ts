import {
    GetLinesAndVehiclesResponse,
    LineStatus,
    VehicleStatusCountType,
} from "src/app/models/query/get-vehicles";
import {
    VehicleStatus as SpottingVehicleStatus,
} from "src/app/spotting/spotting-form/spotting-form.types";

import { GetLinesResponse } from "../models/query/get-vehicles";
import { VehicleFormOptionWType } from "./spotting-form/spotting-form.types";

export interface LineTabType {
    id: string;
    title: string;
    disabled?: boolean;
    detail: string;
    lineStatus: LineStatus;
}

export function lineQueryResultToTabEntries(
    data: GetLinesResponse
): LineTabType[] {
    const lineOptions: LineTabType[] = [];
    for (const line of data.lines) {
        const lineObj = {
            title: `${line.code}`,
            id: line.id,
            disabled: false,
            detail: `${line.displayName}`,
            lineStatus: line.status,
        };
        lineOptions.push(lineObj);
    }

    return lineOptions;
}

export function lineQueryResultToOptions(data: any): {
    name: any;
    value: any;
    disabled?: boolean;
}[] {
    const lineOptions: {
        name: any;
        value: any;
        disabled?: boolean;
    }[] = [];
    for (const line of data.lines) {
        const lineObj = {
            name: `${line.code} - ${line.displayName}`,
            value: line.id,
            disabled: false,
        };
        lineOptions.push(lineObj);
    }

    return lineOptions.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });
}

interface StationLineResponse {
    stationLines: Array<{
        id: string;
        displayName: string;
        internalRepresentation: string;
    }>;
}

export function lineQueryResultToStationCascaderOptions(
    data: StationLineResponse
): { name: any; value: any; disabled?: boolean }[] {
    const returnArr: { name: any; value: any; disabled?: boolean }[] = [];

    for (const line of data.stationLines) {
        returnArr.push({
            name: line.internalRepresentation
                ? `${line.internalRepresentation} - ${line.displayName}`
                : `${line.displayName}`,
            value: line.id,
            disabled: false,
        });
    }

    return returnArr;
}

export function lineQueryResultToVehicleCascaderOptions(
    data: GetLinesAndVehiclesResponse,
    lineId: string | undefined = undefined
): VehicleFormOptionWType[] {
    const vehicles: VehicleFormOptionWType[] = [];

    data.lines
        .filter((line) => {
            return line.id === lineId;
        })
        .forEach((line) => {
            line.vehicleTypes.forEach((vehicleType) => {
                vehicles.push({
                    vehicleTypeDisplayName: `${vehicleType.displayName} (${vehicleType.internalName})`,
                    vehicles: vehicleType.vehicles
                        .map((vehicle) => {
                            return {
                                name: vehicle.identificationNo,
                                value: vehicle.id,
                                disabled: false as boolean,
                                status: vehicle.status as SpottingVehicleStatus,
                            };
                        })
                        .sort((a, b) => {
                            return a.name.localeCompare(b.name);
                        }),
                });
            });
        });

    return vehicles;
}

export const vehicleStatus = [
    "IN_SERVICE",
    "NOT_SPOTTED",
    "OUT_OF_SERVICE",
    "DECOMMISSIONED",
    "TESTING",
    "UNKNOWN",
    "MARRIED",
];

export type VehicleStatus = (typeof vehicleStatus)[number];

export interface TagListDisplayConfig {
    key: keyof VehicleStatusCountType;
    displayPrefix: string;
    checked: boolean;
    status: VehicleStatus;
    labelStyle?: string;
    customColor?: string;
    count?: number;
}

export const tagListDisplayConfig: TagListDisplayConfig[] = [
    {
        key: "vehicleStatusInServiceCount",
        checked: false,
        displayPrefix: "In Service",
        status: "IN_SERVICE",
        labelStyle: "green-w98",
    },
    {
        key: "vehicleStatusNotSpottedCount",
        checked: false,
        displayPrefix: "Not Spotted",
        status: "NOT_SPOTTED",
        labelStyle: "yellow-w98",
    },
    {
        key: "vehicleStatusOutOfServiceCount",
        checked: false,
        displayPrefix: "Out of Service",
        status: "OUT_OF_SERVICE",
        labelStyle: "red-w98",
    },
    {
        key: "vehicleStatusTestingCount",
        checked: false,
        displayPrefix: "Testing",
        status: "TESTING",
        labelStyle: "blue-w98",
    },
    {
        key: "vehicleStatusUnknownCount",
        checked: false,
        displayPrefix: "Unknown",
        status: "UNKNOWN",
        labelStyle: "red-w98",
    },
    {
        key: "vehicleStatusDecommissionedCount",
        checked: false,
        displayPrefix: "Decommissioned",
        status: "DECOMMISSIONED",
        customColor: "var(--devui-text-weak)",
    },
    {
        key: "vehicleStatusMarriedCount",
        checked: false,
        displayPrefix: "Married",
        status: "MARRIED",
        customColor: "var(--devui-text-weak)",
    },
];
