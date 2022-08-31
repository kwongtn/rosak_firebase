export function severityToDotColor(
    severity: "TRIVIA" | "STATUS" | "CRITICAL"
): string {
    const myMap = {
        TRIVIA: "var(--devui-info)",
        STATUS: "var(--devui-info)",
        CRITICAL: "var(--devui-danger)",
    };

    return myMap[severity];
}
