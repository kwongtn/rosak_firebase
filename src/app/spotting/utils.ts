import { CascaderItem } from "ng-devui";

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
): CascaderItem[] {
    const returnArr: CascaderItem[] = [];

    for (const line of data.stationLines) {
        returnArr.push({
            label: line.internalRepresentation
                ? `${line.internalRepresentation} - ${line.displayName}`
                : `${line.displayName}`,
            value: line.id,
            isLeaf: true,
            disabled: false,
        });
    }
    // if (lineId) {
    //     // Cause if there is a line id it will always be single element array
    //     stationOptions = stationOptions[0].children as CascaderItem[];
    // }

    return returnArr;
}

export function lineQueryResultToVehicleCascaderOptions(
    data: any,
    lineId: string | undefined = undefined
): CascaderItem[] {
    let vehicleOptions: CascaderItem[] = [];
    for (const line of data.lines) {
        if (!lineId || line.id === lineId) {
            const lineObj: CascaderItem = {
                label: `${line.code} - ${line.displayName}`,
                value: line.id,
                isLeaf: false,
                disabled: false,
                children: [],
            };
            for (const vehicleType of line.vehicleTypes) {
                const vehicles: CascaderItem[] = [];

                for (const vehicle of vehicleType.vehicles) {
                    vehicles.push({
                        label: `${vehicle.identificationNo} @ ${line.code}`,
                        value: vehicle.id,
                        isLeaf: true,
                        disabled: false,
                    });
                }

                lineObj.children?.push({
                    label: `${vehicleType.internalName}`,
                    value: vehicleType.id,
                    isLeaf: false,
                    disabled: false,
                    children: vehicles.sort((a, b) => {
                        return a.label.localeCompare(b.label);
                    }),
                });
            }
            vehicleOptions.push(lineObj);
        }
    }
    if (lineId) {
        // Cause if there is a line id it will always be single element array
        vehicleOptions = vehicleOptions[0].children as CascaderItem[];
    }

    return vehicleOptions;
}
