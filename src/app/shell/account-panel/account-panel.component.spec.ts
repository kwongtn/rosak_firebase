import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { ToastService } from "../../ui/toast/toast.service";
import { AccountPanelComponent } from "./account-panel.component";

/** The mutation and the clipboard write are promises: one real macrotask lets them settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

describe("AccountPanelComponent", () => {
  let fixture: ComponentFixture<AccountPanelComponent>;
  let graphql: { request: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    graphql = { request: vi.fn(async () => ({ requestVerificationCode: { code: 123456 } })) };
    toast = { success: vi.fn(), error: vi.fn() };
    writeText = vi.fn(async () => undefined);
    // jsdom ships no Clipboard API, so define one on the instance for the panel to call.
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await TestBed.configureTestingModule({
      imports: [AccountPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        // The panel's name links to /profile/:uid, so a router must exist; no routes are visited.
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal({
              uid: "uid-1",
              displayName: "Ada Rider",
              email: "ada@example.com",
              photoURL: null,
            }),
            idToken: vi.fn(async () => null),
          },
        },
        { provide: GraphQLClient, useValue: graphql },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountPanelComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
  });

  function byTestId<T extends HTMLElement = HTMLElement>(testId: string): T {
    const el = (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
    if (!el) {
      throw new Error(`[data-testid="${testId}"] is not rendered`);
    }
    return el;
  }

  /** Clicks Request code, lets the mutation settle, and renders the code it returned. */
  async function requestCode(): Promise<void> {
    byTestId<HTMLButtonElement>("account-request-code").click();
    await settle();
    fixture.detectChanges();
  }

  it("copies the code to the clipboard and confirms with a success toast", async () => {
    await requestCode();

    byTestId<HTMLButtonElement>("account-code-copy").click();
    await settle();

    expect(writeText).toHaveBeenCalledWith("123456");
    expect(toast.success).toHaveBeenCalledWith("Code copied", expect.any(String));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts an error instead of a success when the clipboard refuses the write", async () => {
    writeText.mockRejectedValueOnce(new Error("Document is not focused."));
    await requestCode();

    byTestId<HTMLButtonElement>("account-code-copy").click();
    await settle();

    expect(toast.error).toHaveBeenCalledWith("Couldn't copy code", "Document is not focused.");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
