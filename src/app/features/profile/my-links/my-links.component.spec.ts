import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLink,
  PublicSocialMediaLinksQueryData,
} from "../../insiden/data/social-links.queries";
import { MyLinksComponent } from "./my-links.component";

interface TestableMyLinks {
  loadMore(): Promise<void>;
}

function asTestable(fixture: ComponentFixture<MyLinksComponent>): TestableMyLinks {
  return fixture.componentInstance as unknown as TestableMyLinks;
}

function makeLink(id: string, status: string | null, completed: boolean): PublicSocialMediaLink {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00Z",
    status,
    completed,
    lines: [],
    vehicles: [],
    stations: [],
  };
}

function connectionOf(
  nodes: PublicSocialMediaLink[],
  hasNextPage: boolean,
  endCursor: string | null,
): PublicSocialMediaLinksQueryData {
  return {
    publicSocialMediaLinks: {
      edges: nodes.map((node, index) => ({ node, cursor: endCursor ?? `cursor-${index}` })),
      pageInfo: { hasNextPage, endCursor },
    },
  };
}

describe("MyLinksComponent", () => {
  let requestMock: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<MyLinksComponent>;

  beforeEach(async () => {
    requestMock = vi.fn();

    await TestBed.configureTestingModule({
      imports: [MyLinksComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: { idToken: async () => "token", user: () => null },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyLinksComponent);
    fixture.componentRef.setInput("isOwnProfile", true);
  });

  it("fetches the first page with mine=true and id-token headers", async () => {
    requestMock.mockResolvedValue(
      connectionOf(
        [makeLink("a", "PENDING_APPROVAL", false), makeLink("b", "LIVE", true)],
        false,
        null,
      ),
    );
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    const [query, vars, headers] = requestMock.mock.calls[0];
    expect(query).toBe(PUBLIC_SOCIAL_MEDIA_LINKS_QUERY);
    expect(vars).toEqual({ mine: true, first: 20, after: null });
    expect(headers).toEqual({ "firebase-auth-key": "token" });

    expect(fixture.nativeElement.textContent).toContain("Link a");
    expect(fixture.nativeElement.textContent).toContain("Pending approval");
    expect(fixture.nativeElement.textContent).toContain("Live");
  });

  it("does not fetch when viewing someone else's profile", async () => {
    fixture.componentRef.setInput("isOwnProfile", false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(requestMock).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("No links submitted yet.");
  });

  it("appends the next page via the after cursor", async () => {
    requestMock
      .mockResolvedValueOnce(connectionOf([makeLink("a", "LIVE", true)], true, "cursor-a"))
      .mockResolvedValueOnce(connectionOf([makeLink("b", "LIVE", true)], false, "cursor-b"));

    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));

    await asTestable(fixture).loadMore();
    await fixture.whenStable();

    expect(requestMock.mock.calls[1]).toEqual([
      PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
      { mine: true, first: 20, after: "cursor-a" },
      { "firebase-auth-key": "token" },
    ]);
    expect(fixture.nativeElement.textContent).toContain("Link b");
  });

  it("shows an inline retry when the first page fails", async () => {
    requestMock.mockRejectedValueOnce(new Error("boom"));
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("[data-testid='retry-first-page']")).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load your submitted links.");
  });

  it("falls back to the raw URL as the row heading when title is empty", async () => {
    requestMock.mockResolvedValue(
      connectionOf([{ ...makeLink("c", "LIVE", true), title: "" }], false, null),
    );
    fixture.detectChanges();
    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("https://example.com/c");
  });
});
