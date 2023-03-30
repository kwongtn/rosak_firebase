import { Message } from "ng-devui";
import { NzMessageDataOptions, NzMessageService } from "ng-zorro-antd/message";
import { NzNotificationService } from "ng-zorro-antd/notification";
import {
    NzNotificationDataOptions,
    NzNotificationPlacement,
} from "ng-zorro-antd/notification/typings";

import { Injectable } from "@angular/core";

type NotificationType = "blank" | "success" | "error" | "info" | "warning";
type MessageType = "info" | "success" | "error" | "warning" | "loading";

class NotificationTypeNotFoundError extends Error {}
class MessageTypeNotFoundError extends Error {}

@Injectable({
    providedIn: "root",
})
export class ToastService {
    store: Message[] = [];

    constructor(
        private toastService: NzNotificationService,
        private messageService: NzMessageService
    ) {
        return;
    }

    getPlacement(): NzNotificationPlacement {
        return window.innerWidth < 1024 ? "bottom" : "top";
    }

    addMessage(
        message: string,
        type: MessageType = "info",
        options?: NzMessageDataOptions
    ): void {
        console.log(
            "Add message: ",
            JSON.stringify({
                message,
                options,
                type,
            })
        );

        switch (type) {
        case "loading":
            this.messageService.loading(message, options);
            break;
        case "success":
            this.messageService.success(message, options);
            break;
        case "error":
            this.messageService.error(message, options);
            break;
        case "info":
            this.messageService.info(message, options);
            break;
        case "warning":
            this.messageService.warning(message, options);
            break;

        default:
            throw new MessageTypeNotFoundError(
                `Message type not found, got "${type}".`
            );
        }
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
