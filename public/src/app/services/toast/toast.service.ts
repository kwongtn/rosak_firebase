import { Message } from "ng-devui";
import { ToastService as _ToastService } from "ng-devui/toast";

import { Injectable } from "@angular/core";

@Injectable({
    providedIn: "root",
})
export class ToastService {
    store: Message[] = [];

    constructor(private toastService: _ToastService) {
        return;
    }

    addToast(message: Message): void {
        console.log("Added toast: ", message);
        message.id = new Date().valueOf();
        this.store.unshift(message);

        const toastInstance = this.toastService.open({
            value: this.store,
        }).toastInstance;

        toastInstance.closeEvent.subscribe((value: { message: Message }) => {
            if (value.message.id) {
                this.store = this.store.filter((filterValue: Message) => {
                    return value.message.id !== filterValue.id;
                });
            }
        });

        console.log("Store: ", this.store);
    }
}
