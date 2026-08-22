import { Component, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { provideZonelessChangeDetection } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  CONSOLE_CATEGORIES_QUERY,
  MARK_LINK_COMPLETED_MUTATION,
  SOCIAL_MEDIA_LINKS_QUERY,
  type SocialMediaLinkRow,
} from "../data/insiden-console.queries";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { SocialMediaLinksComponent } from "./links.component";
/* The real app-nav/footer pull in browser-only services (ThemeService needs
 * matchMedia); the shell chrome is irrelevant to these specs, so swap in
 * empty stand-ins. */
@Component({ selector: "app-nav", template: "" })
class StubNav {}

@Component({ selector: "app-footer", template: "" })
class StubFooter {}

function makeLink(overrides: Partial<SocialMediaLinkRow> = {}): SocialMediaLinkRow {
  return {
    id: "link-1",
    url: "https://x.com/prasarana/status/1",
    title: "Service alert",
    created: "2026-08-01T09:00:00Z",
    completed: false,
    completedAt: null,
    user: { nickname: "Zul", shortId: "abcd1234" },
    categories: [{ name: "Disruption" }],
    ...overrides,
  };
}

/** The component's template-facing surface is `protected`; tests reach it
 * through this typed projection instead of leaking `any` into the suite. */
interface ComponentUnderTest {
  isLoading: WritableSignal<boolean>;
  links: WritableSignal<SocialMediaLinkRow[]>;
  categories: WritableSignal<{ id: string; name: string }[]>;
  onSearchInput(value: string): void;
  onCategoryChange(value: string): void;
  onCompletedFilterChange(value: "any" | "pending" | "completed"): void;
  markCompleted(link: SocialMediaLinkRow): Promise<void>;
}

function asTestable(fixture: ComponentFixture<SocialMediaLinksComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

describe("SocialMediaLinksComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<SocialMediaLinksComponent>;

  beforeEach(async () => {
    requestMock = vi.fn().mockImplementation((query: string) => {
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({ socialMediaLinks: [] });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });
    await TestBed.configureTestingModule({
      imports: [SocialMediaLinksComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: AuthService, useValue: { idToken: async () => "token" } },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
        },
      ],
    }).compileComponents();

    TestBed.overrideComponent(SocialMediaLinksComponent, {
      remove: { imports: [AppNavComponent, AppFooterComponent] },
      add: { imports: [StubNav, StubFooter] },
    });
    fixture = TestBed.createComponent(SocialMediaLinksComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Zoneless whenStable() does not track the constructor's fire-and-forget
   * load promises — wait for both queries AND for the loading flag to drop,
   * otherwise a follow-up load() hits its own re-entrancy guard. */
  async function initialLoadsSettled(component: ComponentUnderTest): Promise<void> {
    await fixture.whenStable();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(component.isLoading()).toBe(false));
  }

  function callsFor(queryFragment: string): [string, Record<string, unknown>][] {
    return requestMock.mock.calls.filter((call) => (call[0] as string).includes(queryFragment)) as [
      string,
      Record<string, unknown>,
    ][];
  }

  it("loads links and categories on init without filters", async () => {
    await initialLoadsSettled(asTestable(fixture));

    const [, linkVars] = callsFor("socialMediaLinks")[0];
    expect(linkVars).toEqual({
      search: undefined,
      categoryId: undefined,
      completed: undefined,
    });
    const [, categoryVars] = callsFor("calendarIncidentCategories")[0];
    expect(categoryVars).toBeUndefined();
  });

  it("debounces typing and refetches once with the trimmed term after 300ms", async () => {
    vi.useFakeTimers();
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onSearchInput("  twitter");
    component.onSearchInput("  twitter lrt ");
    await vi.advanceTimersByTimeAsync(299);
    expect(callsFor("socialMediaLinks")).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(callsFor("socialMediaLinks")).toHaveLength(1);
    const [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: "twitter lrt", categoryId: undefined, completed: undefined });
  });

  it("category select refetches immediately with the chosen id", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);
    component.onCategoryChange("7");

    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    const [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: undefined, categoryId: "7", completed: undefined });
  });

  it("status toggle maps pending/completed to false/true and any to undefined", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();

    const component = asTestable(fixture);

    component.onCompletedFilterChange("pending");
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(1));
    let [, vars] = callsFor("socialMediaLinks")[0];
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: false });

    component.onCompletedFilterChange("completed");
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(2));
    [, vars] = callsFor("socialMediaLinks")[1];
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: true });

    component.onCompletedFilterChange("any");
    await vi.waitFor(() => expect(callsFor("socialMediaLinks")).toHaveLength(3));
    [, vars] = callsFor("socialMediaLinks")[2];
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: undefined });
  });

  it("markCompleted calls the mutation and reloads the list", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockImplementation((query: string) => {
      if (query.includes("markSocialMediaLinkCompleted")) {
        return Promise.resolve({ markSocialMediaLinkCompleted: { ok: true } });
      }
      if (query.includes("socialMediaLinks")) {
        return Promise.resolve({
          socialMediaLinks: [makeLink({ id: "link-2", completed: true })],
        });
      }
      return Promise.resolve({ calendarIncidentCategories: [] });
    });

    const component = asTestable(fixture);
    await component.markCompleted(makeLink());

    const mutationCalls = callsFor("markSocialMediaLinkCompleted");
    expect(mutationCalls).toHaveLength(1);
    const [, vars] = mutationCalls[0];
    expect(vars).toEqual({ linkId: "link-1" });
    expect(component.links().map((l) => l.id)).toEqual(["link-2"]);
  });

  it("keeps the list untouched when the mutation fails", async () => {
    await initialLoadsSettled(asTestable(fixture));
    requestMock.mockClear();
    requestMock.mockRejectedValueOnce(new Error("backend down"));

    const component = asTestable(fixture);
    component.links.set([makeLink()]);
    await component.markCompleted(makeLink());

    expect(component.links().map((l) => l.id)).toEqual(["link-1"]);
  });
});
