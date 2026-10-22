import type { StationLine, StationReportNode, StationReportsQueryData } from "./station.queries";

/** One report on the station page: the report and the line it was filed for. */
export interface StationReport extends StationReportNode {
  line: Pick<StationLine, "id" | "code">;
}

/**
 * The reports in a `stationReportsRequest` answer that name `stationId`, newest first (by `created`,
 * then by id, so equal times keep one order between reads). `lines` must be the list the request was
 * built from: alias `line<i>` is `lines[i]`. A missing or null alias contributes nothing.
 *
 * `created` is the backend's offset-free ISO string, so comparing the strings compares the times.
 */
export function stationTaggedReports(
  data: StationReportsQueryData | undefined,
  lines: readonly Pick<StationLine, "id" | "code">[],
  stationId: string,
): StationReport[] {
  const reports: StationReport[] = [];
  lines.forEach((line, index) => {
    for (const { node } of data?.[`line${index}`]?.edges ?? []) {
      if (node.stations.some((station) => station.id === stationId)) {
        reports.push({ ...node, line: { id: line.id, code: line.code } });
      }
    }
  });
  return reports.sort((a, b) => b.created.localeCompare(a.created) || Number(b.id) - Number(a.id));
}
