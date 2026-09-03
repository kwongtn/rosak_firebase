import { PLATFORM_ID, provideZonelessChangeDetection, signal, Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InfiniteScrollDirective } from "./infinite-scroll.directive";

type FakeEntry = Partial<IntersectionObserverEntry>;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn();
  root = null;
  rootMargin = "0px";
  thresholds: number[] = [0];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  unobserve(): void {}
}

@Component({
  imports: [InfiniteScrollDirective],
  template: `
    <div
      data-testid="sentinel"
      appInfiniteScroll
      [appInfiniteScrollLoading]="loading()"
      (loadMore)="count.set(count() + 1)"
    ></div>
  `,
})
class HostComponent {
  readonly loading = signal(false);
  readonly count = signal(0);
}

function fireIntersection(entry: FakeEntry): void {
  const instance = FakeIntersectionObserver.instances[0];
  instance.callback([entry] as IntersectionObserverEntry[], instance as never);
}

describe("InfiniteScrollDirective", () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function create(): Promise<ComponentFixture<HostComponent>> {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it("emits loadMore when the sentinel becomes visible", async () => {
    await create();
    fireIntersection({ isIntersecting: true });
    expect(fixture.componentInstance.count()).toBe(1);
  });

  it("suppresses overlapping emissions while loading is true", async () => {
    await create();
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    fireIntersection({ isIntersecting: true });
    expect(fixture.componentInstance.count()).toBe(0);

    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    await Promise.resolve();
    expect(fixture.componentInstance.count()).toBe(1);
  });

  it("re-fires once when a load finishes while the sentinel is still visible", async () => {
    await create();
    fireIntersection({ isIntersecting: true });
    expect(fixture.componentInstance.count()).toBe(1);

    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    await Promise.resolve();
    expect(fixture.componentInstance.count()).toBe(2);
  });

  it("does not re-fire after the sentinel leaves the viewport", async () => {
    await create();
    fireIntersection({ isIntersecting: true });
    expect(fixture.componentInstance.count()).toBe(1);

    fireIntersection({ isIntersecting: false });
    expect(fixture.componentInstance.count()).toBe(1);

    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    await Promise.resolve();
    expect(fixture.componentInstance.count()).toBe(1);
  });

  it("disconnects the observer on destroy", async () => {
    await create();
    const instance = FakeIntersectionObserver.instances[0];
    fixture.destroy();
    expect(instance.disconnect).toHaveBeenCalled();
  });

  it("no-ops on the server (no IntersectionObserver constructed)", async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: "server" }],
    }).compileComponents();
    const serverFixture = TestBed.createComponent(HostComponent);
    serverFixture.detectChanges();

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(serverFixture.componentInstance.count()).toBe(0);
    expect(() => serverFixture.destroy()).not.toThrow();
  });
});
