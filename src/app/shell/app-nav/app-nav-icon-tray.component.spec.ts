import { provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { ThemeService } from "../../core/theme/theme.service";
import { ImageUploadService } from "../../core/upload/image-upload.service";
import { NewVersionService } from "../../core/version/new-version.service";
import { AppNavIconTrayComponent } from "./app-nav-icon-tray.component";
import { NavIconHoverGroupService } from "./nav-icon-hover-group.service";

/** `AVATAR_HINT_DELAY_MS` in the component — the value the hint timer arms with. */
const AVATAR_HINT_DELAY_MS = 2500;

/**
 * ONE test on purpose: `hasShownAvatarHintThisPageLoad` is module-level and consumed once per
 * module instance, so a second case in this file would see it already `true` and pass for the
 * wrong reason. The race being pinned is a teardown one, so it needs a single clean page load.
 */
describe("AppNavIconTrayComponent", () => {
  it("does not arm the avatar hint when the tray is destroyed before auth resolves", async () => {
    let resolveReady!: () => void;
    const whenReady = new Promise<void>((resolve) => (resolveReady = resolve));

    await TestBed.configureTestingModule({
      imports: [AppNavIconTrayComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: {
            whenReady,
            user: signal(null),
            isLoggedIn: signal(false),
            firstName: signal(null),
            login: vi.fn(),
          },
        },
        { provide: ImageUploadService, useValue: { pendingCount: signal(0) } },
        {
          provide: NewVersionService,
          useValue: { hasNewVersion: signal(false), reloadForNewVersion: vi.fn() },
        },
        {
          provide: NavIconHoverGroupService,
          useValue: {
            isExpanded: () => signal(false),
            onEnter: vi.fn(),
            onLeave: vi.fn(),
          },
        },
        // ThemeToggleComponent (imported by the tray) injects ThemeService.
        { provide: ThemeService, useValue: { mode: signal("system"), cycle: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppNavIconTrayComponent);
    fixture.detectChanges();
    // Flushes `afterNextRender`, so the `whenReady.then` callback is registered but still pending.
    await fixture.whenStable();

    // The top-level navigation happens first: the tray's view is destroyed while auth is in flight.
    fixture.destroy();

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    resolveReady();
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();

    // A tray destroyed before auth resolved never showed the hint — so nothing may have armed it.
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), AVATAR_HINT_DELAY_MS);

    setTimeoutSpy.mockRestore();
  });
});
