import { CascaderItem } from "ng-devui";

import { GetLinesAndVehiclesResponse } from "../models/query/get-vehicles";

export function lineQueryResultToTabEntries(
    data: GetLinesAndVehiclesResponse
): { id: string | number; title: string; disabled?: boolean }[] {
    const lineOptions: {
        id: string | number;
        title: string;
        disabled?: boolean;
    }[] = [];
    for (const line of data.lines) {
        const lineObj = {
            title: `${line.code}`,
            id: line.id,
            disabled: false,
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

    return lineOptions;
}

export function lineQueryResultToStationCascaderOptions(
    data: any,
    lineId: string | undefined = undefined
): CascaderItem[] {
    let stationOptions: CascaderItem[] = [];
    for (const line of data.lines) {
        if (!lineId || line.id === lineId) {
            const lineObj: CascaderItem = {
                label: `${line.code} - ${line.displayName}`,
                value: line.id,
                isLeaf: false,
                disabled: false,
                children: [],
            };
            for (const stationLine of line.stationLines) {
                lineObj.children?.push({
                    label: `${stationLine.internalRepresentation} - ${stationLine.displayName}`,
                    value: stationLine.id,
                    isLeaf: true,
                    disabled: false,
                });
            }
            stationOptions.push(lineObj);
        }
    }
    if (lineId) {
        // Cause if there is a line id it will always be single element array
        stationOptions = stationOptions[0].children as CascaderItem[];
    }

    return stationOptions;
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
                    children: vehicles,
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
