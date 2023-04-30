import { Component } from "@angular/core";

@Component({
    selector: "insiden-calendar",
    templateUrl: "./calendar.component.html",
    styleUrls: ["./calendar.component.scss"],
})
export class CalendarComponent {
    selectedValue = new Date();
    listDataMap = {
        eight: [
            { type: "warning", content: "This is warning event." },
            { type: "success", content: "This is usual event." },
        ],
    };

    selectChange(select: Date): void {
        console.log(`Select value: ${select}`);
    }

    getMonthData(date: Date): number | null {
        if (date.getMonth() === 8) {
            return 1394;
        }
        return null;
    }
}
