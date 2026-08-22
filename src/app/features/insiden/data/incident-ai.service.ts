import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { getApps, initializeApp } from "firebase/app";
import { Functions, getFunctions, httpsCallable } from "firebase/functions";

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

const FUNCTIONS_REGION = "asia-southeast1";

function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

/**
 * Client wrapper for the incident AI Firebase callables (extraction and
 * summarization live in functions/src/index.ts). Both are HTTPS callables that
 * require the caller's Firebase ID token, which httpsCallable attaches from the
 * current auth session automatically. SSR-safe: the functions module is only
 * ever touched on the browser, and callers get back `null` on the server.
 */
@Injectable({ providedIn: "root" })
export class IncidentAiService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly toast = inject(ToastService);
  private functions: Functions | undefined;

  private callable<TIn, TOut>(name: string): ((data: TIn) => Promise<TOut>) | null {
    if (!this.isBrowser) {
      return null;
    }
    this.functions ??= getFunctions(firebaseApp(), FUNCTIONS_REGION);
    const fn = httpsCallable<TIn, TOut>(this.functions, name);
    return async (data: TIn) => {
      const result = await fn(data);
      return result.data;
    };
  }

  /** Summarizes a list of chronology entries into title/brief/details. Returns
   * null on the server or when the callable is unavailable. */
  async summarize(chronologies: SummarizeChronology[]): Promise<SummarizeResult | null> {
    const callable = this.callable<{ chronologies: SummarizeChronology[] }, SummarizeResult>(
      "summarizeIncident",
    );
    if (!callable) {
      return null;
    }
    try {
      const result = await callable({ chronologies });
      return result;
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "Unknown error";
      this.toast.error("Summarization failed", message);
      throw err;
    }
  }
}
