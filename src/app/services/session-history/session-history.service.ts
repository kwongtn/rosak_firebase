import { BehaviorSubject } from "rxjs";

import { Injectable } from "@angular/core";

export type THistoryStore = "spotting" | "mediaUpload";

type IHistoryStore = {
    [timestamp: string]: {
        historyType: THistoryStore;
        [key: string]: any;
    };
};

@Injectable({
    providedIn: "root",
})
export class SessionHistoryService {
    historyStore: BehaviorSubject<IHistoryStore> =
        new BehaviorSubject<IHistoryStore>({});

    historyStoreLength: BehaviorSubject<number> = new BehaviorSubject<number>(
        0
    );

    addSessionHistory(type: THistoryStore, data: any): void {
        this.historyStore.next({
            ...this.historyStore.value,
            [new Date().getTime()]: data,
        });
    }

    clearSessionHistory(): number {
        const len = Object.keys(this.historyStore.value).length;
        this.historyStore.next({});
        return len;
    }

    constructor() {
        this.historyStore.subscribe((val) => {
            this.historyStoreLength.next(Object.keys(val).length);
        });
    }
}
