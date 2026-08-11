import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { environment } from "../../../environments/environment";

declare global {
  interface Window {
    grecaptcha?: {
      ready(cb: () => void): void;
      execute(siteKey: string, options: { action: string }): Promise<string>;
    };
  }
}

/**
 * Loads Google reCAPTCHA v3 on first use and executes an invisible challenge. Needed for
 * `deleteEvent` — unlike `addEvent` (reCAPTCHA disabled on both ends, see spotting.md), the
 * backend's `delete_event` resolver actually enforces `IsRecaptchaChallengePassed`, so this is
 * a real functional requirement, not cosmetic.
 */
@Injectable({ providedIn: "root" })
export class RecaptchaService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private scriptLoadPromise: Promise<void> | undefined;

  private loadScript(): Promise<void> {
    if (!this.isBrowser) {
      return Promise.reject(new Error("reCAPTCHA is not available outside the browser"));
    }
    if (this.scriptLoadPromise) {
      return this.scriptLoadPromise;
    }
    this.scriptLoadPromise = new Promise<void>((resolve, reject) => {
      if (window.grecaptcha) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${environment.captcha.siteKey}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load reCAPTCHA"));
      document.head.appendChild(script);
    });
    return this.scriptLoadPromise;
  }

  async execute(action: string): Promise<string> {
    await this.loadScript();
    return new Promise<string>((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window
          .grecaptcha!.execute(environment.captcha.siteKey, { action })
          .then(resolve)
          .catch(reject);
      });
    });
  }
}
