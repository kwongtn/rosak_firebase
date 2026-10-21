import { PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeService } from "../theme/theme.service";
import { FeedbackService, LOAD_FEEDBACK } from "./feedback.service";

describe("feedback.service: FeedbackService", () => {
  const resolvedTheme = signal<"light" | "dark">("dark");
  const form = { appendToDom: vi.fn(), open: vi.fn() };
  const widget = { setTheme: vi.fn(), createForm: vi.fn() };
  const load = vi.fn();

  beforeEach(() => {
    for (const mock of [form.appendToDom, form.open, widget.setTheme, widget.createForm, load]) {
      mock.mockReset();
    }
    resolvedTheme.set("dark");
    widget.createForm.mockResolvedValue(form);
    load.mockResolvedValue(widget);
  });

  function boot(platform?: string): FeedbackService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ThemeService, useValue: { resolvedTheme } },
        { provide: LOAD_FEEDBACK, useValue: load },
        ...(platform ? [{ provide: PLATFORM_ID, useValue: platform }] : []),
      ],
    });
    return TestBed.inject(FeedbackService);
  }

  it("loads the widget on first use, applies the theme, then opens the form", async () => {
    const service = boot();

    await service.openForm();

    expect(load).toHaveBeenCalledOnce();
    expect(widget.setTheme).toHaveBeenCalledExactlyOnceWith("dark");
    expect(form.appendToDom).toHaveBeenCalledOnce();
    expect(form.open).toHaveBeenCalledOnce();
    // The theme is on the widget before the form is shown, not after.
    expect(widget.setTheme.mock.invocationCallOrder[0]).toBeLessThan(
      form.open.mock.invocationCallOrder[0],
    );
  });

  it("reuses the loaded widget and form on later opens, re-applying the current theme", async () => {
    const service = boot();
    await service.openForm();

    resolvedTheme.set("light");
    await service.openForm();

    expect(load).toHaveBeenCalledOnce();
    expect(widget.createForm).toHaveBeenCalledOnce();
    expect(widget.setTheme).toHaveBeenLastCalledWith("light");
    expect(form.open).toHaveBeenCalledTimes(2);
  });

  it("shares one load and one form between opens that overlap", async () => {
    const service = boot();

    await Promise.all([service.openForm(), service.openForm()]);

    expect(load).toHaveBeenCalledOnce();
    expect(widget.createForm).toHaveBeenCalledOnce();
  });

  it("retries the load on the next open after it failed, instead of replaying the failure", async () => {
    load.mockRejectedValueOnce(new Error("chunk failed"));
    const service = boot();

    await expect(service.openForm()).rejects.toThrow("chunk failed");
    await service.openForm();

    expect(load).toHaveBeenCalledTimes(2);
    expect(form.open).toHaveBeenCalledOnce();
  });

  it("loads nothing on the server", async () => {
    const service = boot("server");

    await service.openForm();

    expect(load).not.toHaveBeenCalled();
    expect(form.open).not.toHaveBeenCalled();
  });
});
