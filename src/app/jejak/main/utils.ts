import { DatePipe } from "@angular/common";

export function convertLocalTime(dtString: string): Date {
    const dataDate = new Date(dtString);
    return new Date(
        dataDate.getTime() - dataDate.getTimezoneOffset() * 60 * 1000
    );
}

export function getLocaleDatetimeFormat(
    dtValue: Date,
    linebreak: string = " "
): string {
    const datepipe: DatePipe = new DatePipe("en-US");

    return (
        datepipe.transform(dtValue, "dd-MMMM-YYYY HH:mm:ss") as string
    ).replace(" ", linebreak);
}
