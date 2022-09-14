import { GetLinesResponse } from "../models/query/get-vehicles";

export interface LineTabType {
    id: string | number;
    title: string;
    disabled?: boolean;
    detail: string;
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
    data: any,
    lineId: string | undefined = undefined
): { name: any; value: any; disabled?: boolean }[] {
    const vehicles: { name: any; value: any; disabled?: boolean }[] = [];
    
    for (const line of data.lines) {
        if (!lineId || line.id === lineId) {
            for (const vehicleType of line.vehicleTypes) {
                for (const vehicle of vehicleType.vehicles) {
                    vehicles.push({
                        name: `${vehicle.identificationNo} (${vehicleType.internalName})`,
                        value: vehicle.id,
                        disabled: false,
                    });
                }
            }
        }
    }

    return vehicles.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });
}
