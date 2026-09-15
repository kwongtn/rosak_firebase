import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JustifiedGridComponent } from "./justified-grid.component";

class FakeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

describe("JustifiedGridComponent smoke", () => {
  let fixture: ComponentFixture<JustifiedGridComponent>;

  beforeEach(async () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    await TestBed.configureTestingModule({
      imports: [JustifiedGridComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(JustifiedGridComponent);
  });

  it("creates and renders without throwing", () => {
    fixture.componentRef.setInput("items", []);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
