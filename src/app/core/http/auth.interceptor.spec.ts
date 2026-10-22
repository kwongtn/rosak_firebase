import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection, signal, type WritableSignal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { AuthService } from "../auth/auth.service";
import { GraphQLClient, graphqlResource } from "../graphql/graphql-client";
import { environment } from "../../../environments/environment";
import { ANONYMOUS, AUTH_SESSION, authInterceptor } from "./auth.interceptor";

const GRAPHQL = environment.backendGraphqlUrl;
const UPLOAD = `${environment.backendUrl}upload/`;
const query = "query { me { id } }";

describe("authInterceptor", () => {
  let httpMock: HttpTestingController;
  let isLoggedIn: WritableSignal<boolean>;
  let idToken: Mock<() => Promise<string | null>>;
  let resolveReady: () => void;

  beforeEach(() => {
    const whenReady = new Promise<void>((resolve) => (resolveReady = resolve));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        // Only graphqlResource's authenticated mode reads it, for `whenReady`.
        { provide: AuthService, useValue: { whenReady } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    isLoggedIn = signal(true);
    idToken = vi.fn<() => Promise<string | null>>(async () => "tok-1");
    TestBed.inject(AUTH_SESSION).set({ isLoggedIn, idToken });
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Posts through the real HttpClient, so the interceptor chain runs. */
  function post(url: string, context?: HttpContext) {
    return firstValueFrom(TestBed.inject(HttpClient).post(url, {}, { context }));
  }

  /** Lets the awaited token through the interceptor. */
  const flushToken = () => new Promise<void>((resolve) => setTimeout(resolve));

  it("signs a GraphQL request and keeps it out of the SSR transfer cache", async () => {
    const sent = post(GRAPHQL);
    await flushToken();

    const call = httpMock.expectOne(GRAPHQL);
    expect(call.request.headers.get("firebase-auth-key")).toBe("tok-1");
    // The cache keys on method, URL and body, not headers, and would answer with the server's
    // anonymous render of the same query.
    expect(call.request.transferCache).toBe(false);
    call.flush({});
    await sent;
  });

  it("signs any other request under the backend URL, such as the photo upload", async () => {
    const sent = post(UPLOAD);
    await flushToken();

    const call = httpMock.expectOne(UPLOAD);
    expect(call.request.headers.get("firebase-auth-key")).toBe("tok-1");
    call.flush({});
    await sent;
  });

  it("never sends the token to another host", async () => {
    const url = "https://example.com/graphql/";
    const sent = post(url);

    const call = httpMock.expectOne(url);
    expect(call.request.headers.has("firebase-auth-key")).toBe(false);
    expect(idToken).not.toHaveBeenCalled();
    call.flush({});
    await sent;
  });

  it("leaves a request marked ANONYMOUS alone", async () => {
    const sent = post(GRAPHQL, new HttpContext().set(ANONYMOUS, true));

    const call = httpMock.expectOne(GRAPHQL);
    expect(call.request.headers.has("firebase-auth-key")).toBe(false);
    expect(call.request.transferCache).toBeUndefined();
    expect(idToken).not.toHaveBeenCalled();
    call.flush({});
    await sent;
  });

  it("sends a signed-out viewer's request at once and unsigned", async () => {
    isLoggedIn.set(false);
    const sent = post(GRAPHQL);

    // No await before this: nothing waits on a token.
    const call = httpMock.expectOne(GRAPHQL);
    expect(call.request.headers.has("firebase-auth-key")).toBe(false);
    expect(idToken).not.toHaveBeenCalled();
    call.flush({});
    await sent;
  });

  it("sends unsigned while no AuthService has started", async () => {
    TestBed.inject(AUTH_SESSION).set(null);
    const sent = post(GRAPHQL);

    const call = httpMock.expectOne(GRAPHQL);
    expect(call.request.headers.has("firebase-auth-key")).toBe(false);
    call.flush({});
    await sent;
  });

  it("waits for the token before sending, and asks for it as the request is made", async () => {
    let resolveToken!: (token: string) => void;
    idToken.mockReturnValue(new Promise((resolve) => (resolveToken = resolve)));

    const sent = post(GRAPHQL);
    // Asked at once: a request made just before a sign-out (PushService.forget) still gets the
    // session's token.
    expect(idToken).toHaveBeenCalledTimes(1);
    await flushToken();
    httpMock.expectNone(GRAPHQL);

    resolveToken("tok-late");
    await flushToken();
    const call = httpMock.expectOne(GRAPHQL);
    expect(call.request.headers.get("firebase-auth-key")).toBe("tok-late");
    call.flush({});
    await sent;
  });

  it("sends unsigned when a signed-in session has no token to give", async () => {
    idToken.mockResolvedValue(null);
    const sent = post(GRAPHQL);
    await flushToken();

    const call = httpMock.expectOne(GRAPHQL);
    expect(call.request.headers.has("firebase-auth-key")).toBe(false);
    call.flush({});
    await sent;
  });

  it("fails the request with Firebase's error when the token refresh fails, and sends nothing", async () => {
    const refreshFailed = Object.assign(new Error("network"), {
      code: "auth/network-request-failed",
    });
    idToken.mockRejectedValue(refreshFailed);

    await expect(post(GRAPHQL)).rejects.toBe(refreshFailed);
    httpMock.expectNone(GRAPHQL);
  });

  describe("with the GraphQL helpers", () => {
    const isGraphql = (r: { method: string; url: string; body: { query?: string } }) =>
      r.method === "POST" && r.url === GRAPHQL && r.body.query === query;

    it("signs GraphQLClient.request and keeps the caller's own headers", async () => {
      const sent = TestBed.inject(GraphQLClient).request(
        query,
        {},
        { "g-recaptcha-response": "r" },
      );
      await flushToken();

      const call = httpMock.expectOne(isGraphql);
      expect(call.request.headers.get("firebase-auth-key")).toBe("tok-1");
      expect(call.request.headers.get("g-recaptcha-response")).toBe("r");
      call.flush({ data: {} });
      await sent;
    });

    it("sends GraphQLClient.request unsigned and cacheable when asked for anonymous", async () => {
      const sent = TestBed.inject(GraphQLClient).request(query, {}, undefined, {
        anonymous: true,
      });

      // No await before this: nothing waits on a token.
      const call = httpMock.expectOne(isGraphql);
      expect(call.request.headers.has("firebase-auth-key")).toBe(false);
      expect(call.request.transferCache).toBeUndefined();
      expect(idToken).not.toHaveBeenCalled();
      call.flush({ data: {} });
      await sent;
    });

    it("rejects GraphQLClient.request with the refresh error, not an HTTP error", async () => {
      const refreshFailed = new Error("token expired offline");
      idToken.mockRejectedValue(refreshFailed);

      const sent = TestBed.inject(GraphQLClient).request(query);
      await expect(sent).rejects.toBe(refreshFailed);
      await expect(sent).rejects.not.toBeInstanceOf(HttpErrorResponse);
    });

    it("keeps a graphqlResource read anonymous by default", async () => {
      TestBed.runInInjectionContext(() => graphqlResource(() => ({ query })));
      TestBed.tick();

      const call = httpMock.expectOne(isGraphql);
      expect(call.request.headers.has("firebase-auth-key")).toBe(false);
      expect(call.request.context.get(ANONYMOUS)).toBe(true);
      expect(idToken).not.toHaveBeenCalled();
      call.flush({ data: {} });
    });

    it("holds an authenticated graphqlResource read until the session is restored, then signs it", async () => {
      const resource = TestBed.runInInjectionContext(() =>
        graphqlResource<{ me: { id: string } }>(() => ({ query }), { authenticated: true }),
      );
      TestBed.tick();
      await flushToken();
      httpMock.expectNone(isGraphql);

      resolveReady();
      await flushToken();
      TestBed.tick();
      await flushToken();

      const call = httpMock.expectOne(isGraphql);
      expect(call.request.headers.get("firebase-auth-key")).toBe("tok-1");
      expect(call.request.context.get(ANONYMOUS)).toBe(false);
      call.flush({ data: { me: { id: "u1" } } });
      await vi.waitFor(() => expect(resource.data()).toEqual({ me: { id: "u1" } }));
    });
  });
});
