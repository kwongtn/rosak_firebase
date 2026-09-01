import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

import { environment } from "../../../../environments/environment";
import { ToastService } from "../../../ui/toast/toast.service";

export interface SummarizeChronology {
  indicator: string;
  datetime?: string | null;
  content?: string | null;
  sourceUrl?: string | null;
}

export interface SummarizeResult {
  title: string;
  brief: string;
  details: string;
}

/** Shape of the extraction data returned by the extractIncidentData endpoint —
 * matches the parser in functions/src/utils/extractionParser.ts. */
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

export interface ExtractIncidentResult {
  requestId: string;
  data: ExtractedIncidentData;
}

const FUNCTIONS_REGION = "asia-southeast1";

function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

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

/** Resolves the current user's Firebase ID token, or null if not authenticated. */
async function currentIdToken(): Promise<string | null> {
  const user = getAuth(firebaseApp()).currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}

/**
 * Client wrapper for the incident AI functions (extraction and summarization live
 * in functions/src/index.ts). Both are HTTPS endpoints that require the caller's
 * Firebase ID token, attached as a Bearer header. SSR-safe: the auth/module is
 * only ever touched on the browser, and callers get back `null` on the server.
 */
@Injectable({ providedIn: "root" })
export class IncidentAiService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly toast = inject(ToastService);

  /** Summarizes a list of chronology entries into title/brief/details. Returns
   * null on the server or when the user is unauthenticated. */
  async summarize(chronologies: SummarizeChronology[]): Promise<SummarizeResult | null> {
    if (!this.isBrowser) {
      return null;
    }
    const token = await currentIdToken();
    if (!token) {
      this.toast.error("Please log in", "You need an account to use AI summarization.");
      return null;
    }
    try {
      const res = await fetch(apiUrl("/summarize"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chronologies }),
      });
      if (!res.ok) {
        throw new Error(`Summarization failed (${res.status})`);
      }
      return (await res.json()) as SummarizeResult;
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "Unknown error";
      this.toast.error("Summarization failed", message);
      throw err;
    }
  }

  /** Extracts incident data from a source URL. Callers pass their own requestId so
   * late responses can be matched (and ignored) after a row has been deleted. The
   * result echoes it back; throws (after toasting) on failure. Returns null on the
   * server or when the user is unauthenticated. */
  async extract(url: string, requestId: string): Promise<ExtractIncidentResult | null> {
    if (!this.isBrowser) {
      return null;
    }
    const token = await currentIdToken();
    if (!token) {
      this.toast.error("Please log in", "You need an account to use AI extraction.");
      return null;
    }
    try {
      const res = await fetch(apiUrl("/extract"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url, requestId }),
      });
      if (!res.ok) {
        throw new Error(`Data extraction failed (${res.status})`);
      }
      return (await res.json()) as ExtractIncidentResult;
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "Unknown error";
      this.toast.error("Data extraction failed", message);
      throw err;
    }
  }
}
