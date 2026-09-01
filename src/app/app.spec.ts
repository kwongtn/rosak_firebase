import { HttpErrorResponse } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ErrorHandler, provideZonelessChangeDetection } from "@angular/core";
import { provideRouter } from "@angular/router";
import { TestBed } from "@angular/core/testing";
import * as Sentry from "@sentry/angular";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorHandler, is404Error } from "./app.config";
import { NewVersionService } from "./core/version/new-version.service";

describe("is404Error", () => {
  it("should identify HttpErrorResponse with 404 status", () => {
    const err = new HttpErrorResponse({ status: 404, statusText: "Not Found" });
    expect(is404Error(err)).toBe(true);
  });

  it("should identify wrapped HttpErrorResponse with 404 status", () => {
    const err = { ngOriginalError: new HttpErrorResponse({ status: 404 }) };
    expect(is404Error(err)).toBe(true);
  });

  it("should identify error object with status 404", () => {
    expect(is404Error({ status: 404 })).toBe(true);
    expect(is404Error({ statusCode: 404 })).toBe(true);
  });

  it("should identify error messages mentioning 404", () => {
    expect(is404Error("Server returned code 404")).toBe(true);
    expect(is404Error(new Error("Resource not found: 404"))).toBe(true);
  });

  it("should return false for other errors", () => {
    expect(is404Error(new HttpErrorResponse({ status: 500 }))).toBe(false);
    expect(is404Error(new Error("Something went wrong"))).toBe(false);
    expect(is404Error(null)).toBe(false);
    expect(is404Error(undefined)).toBe(false);
  });
});

describe("AppErrorHandler chunk-load detection", () => {
  let handler: AppErrorHandler;
  let newVersionService: NewVersionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ErrorHandler, useClass: AppErrorHandler },
        {
          provide: Sentry.TraceService,
          useValue: {},
        },
      ],
    });
    handler = TestBed.inject(ErrorHandler) as AppErrorHandler;
    newVersionService = TestBed.inject(NewVersionService);
  });

  it("should trigger new-version prompt on Chrome's 'Failed to fetch dynamically imported module'", () => {
    const promptSpy = vi.spyOn(newVersionService, "promptReloadForNewVersion");
    const error = new TypeError(
      "Failed to fetch dynamically imported module: https://example.com/chunk-DhaE6BFK.js",
    );
    handler.handleError(error);
    expect(promptSpy).toHaveBeenCalled();
  });

  it("should trigger new-version prompt on webpack-style 'Loading chunk' error", () => {
    const promptSpy = vi.spyOn(newVersionService, "promptReloadForNewVersion");
    handler.handleError(new Error("Loading chunk 12 failed"));
    expect(promptSpy).toHaveBeenCalled();
  });

  it("should trigger new-version prompt on error wrapped in ngOriginalError", () => {
    const promptSpy = vi.spyOn(newVersionService, "promptReloadForNewVersion");
    const error = { ngOriginalError: new Error("Loading chunk 5 failed") };
    handler.handleError(error);
    expect(promptSpy).toHaveBeenCalled();
  });

  it("should NOT trigger prompt for ordinary runtime errors", () => {
    const promptSpy = vi.spyOn(newVersionService, "promptReloadForNewVersion");
    handler.handleError(new Error("Cannot read properties of undefined (reading 'id')"));
    expect(promptSpy).not.toHaveBeenCalled();
  });
});
