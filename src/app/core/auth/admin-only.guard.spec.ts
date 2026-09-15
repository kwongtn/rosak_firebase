import { signal, WritableSignal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from "@angular/router";
import { describe, expect, it } from "vitest";

import { AuthService } from "./auth.service";
import { adminOnlyGuard } from "./admin-only.guard";

interface AuthStub {
  isAdmin: WritableSignal<boolean>;
  whenReady: Promise<void>;
  resolveReady: () => void;
}

function stubAuth(initialAdmin: boolean): AuthStub {
  let resolveReady!: () => void;
  const whenReady = new Promise<void>((resolve) => (resolveReady = resolve));
  return {
    isAdmin: signal(initialAdmin),
    whenReady,
    resolveReady,
  } as unknown as AuthStub;
}

async function setup(authStub: AuthStub): Promise<AuthStub> {
  await TestBed.resetTestingModule()
    .configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: authStub }],
    })
    .compileComponents();
  return authStub;
}

async function runGuard(): Promise<boolean | UrlTree> {
  return (await TestBed.runInInjectionContext(() =>
    adminOnlyGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  )) as boolean | UrlTree;
}

describe("adminOnlyGuard", () => {
  it("lets an admin through", async () => {
    const auth = await setup(stubAuth(true));
    auth.resolveReady();

    expect(await runGuard()).toBe(true);
  });

  it("redirects a non-admin to /spotting", async () => {
    const auth = await setup(stubAuth(false));
    auth.resolveReady();

    const result = await runGuard();
    expect(result).toBeInstanceOf(UrlTree);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe("/spotting");
  });

  it("waits for the auth session before deciding, so a refresh as admin survives", async () => {
    const auth = await setup(stubAuth(false));

    const pending: Promise<boolean | UrlTree> = runGuard();
    let settled = false;
    void pending.then(() => (settled = true));

    auth.isAdmin.set(true);
    auth.resolveReady();

    expect(await pending).toBe(true);
    expect(settled).toBe(true);
  });
});
