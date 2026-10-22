import { Injectable, inject } from "@angular/core";

import { AuthService } from "../../../core/auth/auth.service";
import { injectIsBrowser } from "../../../core/composables/is-browser";
import { environment } from "../../../../environments/environment";
import { ToastService } from "../../../ui/toast/toast.service";

interface SummarizeChronology {
  indicator: string;
  datetime?: string | null;
  content?: string | null;
  sourceUrl?: string | null;
}

interface SummarizeResult {
  title: string;
  brief: string;
  details: string;
}

/** Shape of the extraction data returned by the extractIncidentData endpoint —
 * matches the parser in functions/src/utils/extractionParser.ts. `indicator`, `severity` and the
 * affected names are the model's words, not the form's enums or ids: the incident form translates
 * them in incident-form/extract-data.util.ts. */
export interface ExtractedIncidentData {
  title: string | null;
  datetime: string | null;
  content: string | null;
  source_url: string;
  indicator: "delay" | "disruption" | "accident" | "maintenance" | "other";
  severity: "minor" | "moderate" | "major" | "critical" | null;
  affected_lines: string[];
  affected_stations: string[];
}

interface ExtractIncidentResult {
  requestId: string;
  data: ExtractedIncidentData;
}

const FUNCTIONS_REGION = "asia-southeast1";

/** Base URL for the Express functions API, derived from the Firebase projectId so
 * it stays correct if the project ever changes — no hardcoded ID. */
function functionsBaseUrl(): string {
  return `https://${FUNCTIONS_REGION}-${environment.firebase.projectId}.cloudfunctions.net/api`;
}

/** Env path segment: staging builds hit the staging function, everything else (prod
 * and the rare "production" alias) hits main. */
function envSegment(): string {
  return environment.environmentName === "staging" ? "staging" : "main";
}

function apiUrl(path: "/extract" | "/summarize"): string {
  return `${functionsBaseUrl()}/${envSegment()}/v1${path}`;
}

/**
 * Client wrapper for the incident AI functions (extraction and summarization live
 * in functions/src/index.ts). Both are HTTPS endpoints that require the caller's
 * Firebase ID token (from `AuthService`), attached as a Bearer header. SSR-safe: callers
 * get back `null` on the server.
 */
@Injectable({ providedIn: "root" })
export class IncidentAiService {
  private readonly isBrowser = injectIsBrowser();
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  /** Summarizes a list of chronology entries into title/brief/details. Returns
   * null on the server or when the user is unauthenticated. */
  summarize(chronologies: SummarizeChronology[]): Promise<SummarizeResult | null> {
    return this.post<SummarizeResult>(
      "/summarize",
      { chronologies },
      "summarization",
      "Summarization failed",
    );
  }

  /** Extracts incident data from a source URL. Callers pass their own requestId so
   * late responses can be matched (and ignored) after a row has been deleted. The
   * result echoes it back; throws (after toasting) on failure. Returns null on the
   * server or when the user is unauthenticated. */
  extract(url: string, requestId: string): Promise<ExtractIncidentResult | null> {
    return this.post<ExtractIncidentResult>(
      "/extract",
      { url, requestId },
      "extraction",
      "Data extraction failed",
    );
  }

  /** POSTs `body` to one AI endpoint with the rider's ID token. Null on the server or with no
   * signed-in user (after a toast); a network error or a non-2xx answer is toasted as `failure`
   * and rethrown. */
  private async post<T>(
    path: "/extract" | "/summarize",
    body: unknown,
    feature: string,
    failure: string,
  ): Promise<T | null> {
    if (!this.isBrowser) {
      return null;
    }
    const token = await this.auth.idToken();
    if (!token) {
      this.toast.error("Please log in", `You need an account to use AI ${feature}.`);
      return null;
    }
    try {
      const res = await fetch(apiUrl(path), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`${failure} (${res.status})`);
      }
      return (await res.json()) as T;
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "Unknown error";
      this.toast.error(failure, message);
      throw err;
    }
  }
}
