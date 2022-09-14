import { AbstractControl, ValidationErrors } from "@angular/forms";

export function betweenStationTypeOriginDestinationStationValidator(
    abstractControl: AbstractControl
): ValidationErrors | null {
    const errors: any = {};

    if (abstractControl.get("type")?.value.value === "BETWEEN_STATIONS") {
        if (!abstractControl.get("originStation")?.value) {
            errors["originStation"] = "originStation not selected";
        }

        if (!abstractControl.get("destinationStation")?.value) {
            errors["destinationStation"] = "destinationStation not selected";
        }
    }

    if (JSON.stringify(errors) === "{}") {
        return null;
    } else {
        return errors;
    }
}

export function numberSeenToSetNumber(input: string, line: string) {
    const props: {
        [key: string]: {
            triggerLength: number;
            startConcat: number;
            endConcat: number;
            prefix?: string;
        };
    } = {
        KJL: {
            triggerLength: 3,
            startConcat: 1,
            endConcat: 3,
        },
        AGL: {
            triggerLength: 4,
            startConcat: 0,
            endConcat: 3,
        },
        SPL: {
            triggerLength: 4,
            startConcat: 0,
            endConcat: 3,
        },
        MRL: {
            triggerLength: 4,
            startConcat: 0,
            endConcat: 2,
            prefix: "RSV",
        },
        KGL: {
            triggerLength: 4,
            startConcat: 0,
            endConcat: 3,
        },
        PYL: {
            triggerLength: 4,
            startConcat: 0,
            endConcat: 3,
        },
    };

    if (Object.keys(props).includes(line)) {
        const prop = props[line];

        if (input.length !== prop.triggerLength) {
            return undefined;
        }

        if (prop.prefix) {
            input += prop.prefix + input;
        }

        return input.substring(prop.startConcat, prop.endConcat);
    } else {
        return undefined;
    }
}
