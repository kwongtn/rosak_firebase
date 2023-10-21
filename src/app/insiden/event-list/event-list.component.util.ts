interface CommaConfig {
    day?: boolean;
    hour?: boolean;
    minute?: boolean;
    second?: boolean;
}

export function getReadableTimeDifference(
    date1: Date,
    date2: Date,
    commaConfig: CommaConfig = {
        day: true,
    }
): string {
    const timeDiff = Math.abs(date1.getTime() - date2.getTime());

    const seconds = Math.floor((timeDiff / 1000) % 60);
    const minutes = Math.floor((timeDiff / (1000 * 60)) % 60);
    const hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    const parts = [];

    if (days > 0) {
        parts.push(`${days} day${days > 1 ? "s" : ""}`);
        commaConfig.day ? parts.push(", ") : parts.push(" ");
    }

    if (hours > 0) {
        parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
        commaConfig.hour ? parts.push(", ") : parts.push(" ");
    }

    if (minutes > 0) {
        parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
        commaConfig.minute ? parts.push(", ") : parts.push(" ");
    }

    if (seconds > 0) {
        parts.push(`${seconds} second${seconds > 1 ? "s" : ""}`);
        commaConfig.second ? parts.push(", ") : parts.push(" ");
    }

    return parts.join("");
}
