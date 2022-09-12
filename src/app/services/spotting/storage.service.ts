import { Injectable } from "@angular/core";

@Injectable({
    providedIn: "any",
})
export class SpottingStorageService {
    lineObj: any | undefined;

    constructor() {
        return;
    }

    setLine(lineObj: any) {
        this.lineObj = lineObj;
    }

    getLine(): any | undefined {
        return this.lineObj;
    }
}
