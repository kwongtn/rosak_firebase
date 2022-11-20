import { Injectable } from "@angular/core";

@Injectable({
    providedIn: "any",
})
export class SpottingStorageService {
    lineObj: any | undefined;
    typeObj: any = {
        name: "Just Spotting",
        value: "JUST_SPOTTING",
    };

    constructor() {
        return;
    }

    setLine(lineObj: any) {
        this.lineObj = lineObj;
    }

    getLine(): any | undefined {
        return this.lineObj;
    }

    setType(typeObj: any) {
        this.typeObj = typeObj;
    }

    getType(): any {
        return this.typeObj;
    }
}
