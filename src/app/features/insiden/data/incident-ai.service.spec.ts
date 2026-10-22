import { PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { IncidentAiService, type ExtractedIncidentData } from "./incident-ai.service";

const EXTRACTED: ExtractedIncidentData = {
  title: "Signal fault",
  datetime: "2026-10-01T05:23:15",
  content: "Trains held at KL Sentral",
  source_url: "https://x.com/a/1",
  indicator: "disruption",
  severity: "major",
  affected_lines: [],
  affected_stations: [],
};

describe("IncidentAiService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let idToken: ReturnType<typeof vi.fn>;
  let toast: { error: ReturnType<typeof vi.fn> };

  function setUp(platform = "browser"): IncidentAiService {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: AuthService, useValue: { idToken } },
        { provide: ToastService, useValue: toast },
      ],
    });
    return TestBed.inject(IncidentAiService);
  }

  function answer(status: number, body: unknown): void {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    idToken = vi.fn(async (): Promise<string | null> => "token-1");
    toast = { error: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the source URL with the AuthService token and returns the extraction", async () => {
    answer(200, { requestId: "r1", data: EXTRACTED });

    const result = await setUp().extract("https://x.com/a/1", "r1");

    expect(result).toEqual({ requestId: "r1", data: EXTRACTED });
    expect(idToken).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(
      /^https:\/\/asia-southeast1-.+\.cloudfunctions\.net\/api\/\w+\/v1\/extract$/,
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token-1",
    });
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://x.com/a/1", requestId: "r1" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("posts the entries to the summarize endpoint", async () => {
    const summary = { title: "Signal fault", brief: "Trains held", details: "" };
    answer(200, summary);
    const entries = [{ indicator: "RED", datetime: "2026-10-01T05:23", content: "Held" }];

    const result = await setUp().summarize(entries);

    expect(result).toEqual(summary);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/summarize$/);
    expect(JSON.parse(init.body as string)).toEqual({ chronologies: entries });
  });

  it.each([
    [401, "Data extraction failed (401)"],
    [429, "Data extraction failed (429)"],
    [502, "Data extraction failed (502)"],
  ])("toasts and throws on a %i answer", async (status, message) => {
    answer(status, { error: "nope" });

    await expect(setUp().extract("https://x.com/a/1", "r1")).rejects.toThrow(message);

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Data extraction failed", message);
  });

  it("toasts and rethrows a network error with its own message", async () => {
    const offline = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValueOnce(offline);

    await expect(setUp().summarize([])).rejects.toBe(offline);

    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Summarization failed", "Failed to fetch");
  });

  it("asks the rider to log in, and sends nothing, when there is no signed-in user", async () => {
    idToken.mockResolvedValueOnce(null);

    const result = await setUp().extract("https://x.com/a/1", "r1");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Please log in",
      "You need an account to use AI extraction.",
    );
  });

  it("returns null on the server without asking for a token or calling out", async () => {
    const service = setUp("server");

    expect(await service.summarize([])).toBeNull();
    expect(await service.extract("https://x.com/a/1", "r1")).toBeNull();
    expect(idToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
