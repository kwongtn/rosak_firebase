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
    lineObj: TGenericSeachField | undefined;
    typeObj: TGenericSeachField = {
        name: "Just Spotting",
        value: "JUST_SPOTTING",
    };
    atStationStationObj: TGenericSeachField | undefined;

    constructor() {
        return;
    }

    setLine(lineObj: TGenericSeachField) {
        this.lineObj = lineObj;
    }

    getLine(): TGenericSeachField | undefined {
        return this.lineObj;
    }

    setType(typeObj: TGenericSeachField) {
        this.typeObj = typeObj;
    }

    getType(): TGenericSeachField {
        return this.typeObj;
    }

    setAtStationStation(atStationStationObj: TGenericSeachField) {
        this.atStationStationObj = atStationStationObj;
    }

    getAtStationStation(): TGenericSeachField | undefined {
        return this.atStationStationObj;
    }
}
