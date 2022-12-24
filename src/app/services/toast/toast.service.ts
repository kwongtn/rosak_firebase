import { Message } from "ng-devui";
import { NzNotificationService } from "ng-zorro-antd/notification";
import {
    NzNotificationDataOptions,
    NzNotificationPlacement,
} from "ng-zorro-antd/notification/typings";

import { Injectable } from "@angular/core";

type NotificationType = "blank" | "success" | "error" | "info" | "warning";

class NotificationTypeNotFoundError extends Error {}

@Injectable({
    providedIn: "root",
})
export class ToastService {
    store: Message[] = [];

    constructor(private toastService: NzNotificationService) {
        return;
    }

    getPlacement(): NzNotificationPlacement {
        return window.innerWidth < 1024 ? "bottom" : "top";
    }

    addToast(
        title: string,
        content: string,
        type: NotificationType = "info",
        options?: NzNotificationDataOptions
    ): void {
        options = {
            nzPlacement: this.getPlacement(),
            ...options,
        };

        console.log(
            "Add toast: ",
            JSON.stringify({
                title,
                content,
                options,
                type,
            })
        );

        switch (type) {
        case "blank":
            this.toastService.blank(title, content, options);
            break;
        case "success":
            this.toastService.success(title, content, options);
            break;
        case "error":
            this.toastService.error(title, content, options);
            break;
        case "info":
            this.toastService.info(title, content, options);
            break;
        case "warning":
            this.toastService.warning(title, content, options);
            break;

        default:
            throw new NotificationTypeNotFoundError(
                `Notification type not found, got "${type}".`
            );
        }
    }
}
