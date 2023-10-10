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

export function abnormalStatusSanityTestValidator(
    abstractControl: AbstractControl
): ValidationErrors | null {
    const errors: any = {};

    if (
        ["DECOMMISSIONED", "MARRIED", "OUT_OF_SERVICE", "UNKNOWN"].includes(
            abstractControl.get("vehicle")?.value.status ?? ""
        ) &&
        !abstractControl.get("sanityTest")?.value
    ) {
        errors["sanityTest"] = "sanityTest not passed";
    }

    if (JSON.stringify(errors) === "{}") {
        return null;
    } else {
        return errors;
    }
}

export function atStationTypeStationValidator(
    abstractControl: AbstractControl
): ValidationErrors | null {
    const errors: any = {};

    if (abstractControl.get("type")?.value.value === "AT_STATION") {
        if (!abstractControl.get("atStation")?.value) {
            errors["atStation"] = "Station not selected";
        }
    }

    if (JSON.stringify(errors) === "{}") {
        return null;
    } else {
        return errors;
    }
}

export function allowRunNumber(value: string): boolean {
    return ["2", "3"].includes(value);
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
        "4": {
            // LRT Kelana Jaya Line
            triggerLength: 3,
            startConcat: 1,
            endConcat: 3,
        },
        "5": {
            // LRT Ampang Line
            triggerLength: 4,
            startConcat: 0,
            endConcat: 3,
        },
        "9": {
            // LRT Sri Petaling Line
            triggerLength: 4,
            startConcat: 0,
            endConcat: 3,
        },
        "1": {
            // Monorail
            triggerLength: 4,
            startConcat: 0,
            endConcat: 2,
        },
        "2": {
            // MRT Kajang Line
            triggerLength: 4,
            startConcat: 0,
            endConcat: 3,
        },
        "3": {
            // MRT Putrajaya Line
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

        return input.substring(prop.startConcat, prop.endConcat);
    } else if (["6", "7", "13", "14"].includes(line)) {
        /**
         * KTM - Port Klang, Seremban, Padang Besar, Padang Rengas
         *
         * Covers class 81, 83, 92
         */
        const coachClass = input[0].toUpperCase();
        if (
            input.length === 5 &&
            // We can confirm that set number here starts with C, T or M
            ["C", "T", "M"].includes(coachClass)
        ) {
            const classNum = Number(input.substring(1, 3));
            let coachNum = Number(input.substring(input.length - 2));

            if (classNum === 92) {
                return (
                    "SCS" +
                    Math.ceil(coachNum / 2)
                        .toString()
                        .padStart(2, "0")
                );
            } else if (classNum === 81) {
                if (coachClass === "C") {
                    coachNum = Math.ceil(coachNum / 2);
                }
                return "EMU" + coachNum.toString().padStart(2, "0");
            } else if (classNum === 83) {
                if (coachClass === "C") {
                    coachNum = Math.ceil(coachNum / 2);
                }
                return "EMU" + (coachNum + 18).toString().padStart(2, "0");
            }
        } else {
            return undefined;
        }
    } else {
        return undefined;
    }
}
