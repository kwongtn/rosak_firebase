import { IncidentSeverityType } from "src/app/models/query/get-vehicles";

export function severityToDotColor(severity: IncidentSeverityType): string {
    const myMap = {
        TRIVIA: "var(--devui-info)",
        STATUS: "var(--devui-success)",
        CRITICAL: "var(--devui-danger)",
    };

    return myMap[severity];
}
