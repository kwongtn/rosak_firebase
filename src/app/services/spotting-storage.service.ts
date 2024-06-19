import { Injectable } from "@angular/core";

interface TGenericSeachField {
    name: string;
    value: string;
    disabled?: boolean;
}

@Injectable({
    providedIn: "root",
})
export class SpottingStorageService {
    lineId: string | undefined;
    typeObj: string = "JUST_SPOTTING";
    atStationStationObj: TGenericSeachField | undefined;

    constructor() {
        return;
    }

    setLine(lineId: string) {
        this.lineId = lineId;
    }

    getLine(): string | undefined {
        return this.lineId;
    }

    setType(typeObj: string) {
        this.typeObj = typeObj;
    }

    getType(): string {
        return this.typeObj;
    }

    setAtStationStation(atStationStationObj: TGenericSeachField) {
        this.atStationStationObj = atStationStationObj;
    }

    getAtStationStation(): TGenericSeachField | undefined {
        return this.atStationStationObj;
    }
}
