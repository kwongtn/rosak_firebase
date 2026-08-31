export function linesLabel(lines: { code: string }[]): string {
  return lines.map((l) => l.code).join(", ");
}

export function vehicleLinesLabel(vehicle: { lines: { code: string }[] }): string {
  return linesLabel(vehicle.lines);
}
