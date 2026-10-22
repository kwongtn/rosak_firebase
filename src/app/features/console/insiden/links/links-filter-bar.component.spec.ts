import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LinksFilterBarComponent } from "./links-filter-bar.component";

describe("LinksFilterBarComponent", () => {
  let fixture: ComponentFixture<LinksFilterBarComponent>;
  let root: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(LinksFilterBarComponent);
    fixture.componentRef.setInput("categories", [{ id: "c1", name: "Delay" }]);
    fixture.componentRef.setInput("lineOptions", [{ id: "l1", label: "Kelana Jaya" }]);
    fixture.componentRef.setInput("filterVehicleOptions", [{ id: "v1", label: "SCS 12" }]);
    fixture.componentRef.setInput("filterStationOptions", [{ id: "s1", label: "KL Sentral" }]);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  /** Sets the control's value and fires the event the template listens to, like a user would. */
  function edit(control: HTMLElement | null, value: string, event: "input" | "change"): void {
    if (!control) throw new Error("control not rendered");
    (control as HTMLInputElement | HTMLSelectElement).value = value;
    control.dispatchEvent(new Event(event, { bubbles: true }));
  }

  it("reports the search box as you type", () => {
    const spy = vi.fn();
    fixture.componentInstance.searchInput.subscribe(spy);
    edit(root.querySelector("input[type='text']"), "twitter.com", "input");
    expect(spy).toHaveBeenCalledWith("twitter.com");
  });

  it("reports the category, line, vehicle and station selects", () => {
    const category = vi.fn();
    const line = vi.fn();
    const vehicle = vi.fn();
    const station = vi.fn();
    fixture.componentInstance.categoryChange.subscribe(category);
    fixture.componentInstance.filterLineChange.subscribe(line);
    fixture.componentInstance.filterVehicleChange.subscribe(vehicle);
    fixture.componentInstance.filterStationChange.subscribe(station);

    const selects = root.querySelectorAll<HTMLSelectElement>("select");
    // Order in the template: category, status, visibility, line, vehicle, station.
    edit(selects[0], "c1", "change");
    edit(selects[3], "l1", "change");
    edit(selects[4], "v1", "change");
    edit(selects[5], "s1", "change");

    expect(category).toHaveBeenCalledWith("c1");
    expect(line).toHaveBeenCalledWith("l1");
    expect(vehicle).toHaveBeenCalledWith("v1");
    expect(station).toHaveBeenCalledWith("s1");
  });

  it("reports the status and visibility selects as their union members", () => {
    const completed = vi.fn();
    const visibility = vi.fn();
    fixture.componentInstance.completedChange.subscribe(completed);
    fixture.componentInstance.visibilityChange.subscribe(visibility);

    const selects = root.querySelectorAll<HTMLSelectElement>("select");
    edit(selects[1], "completed", "change");
    edit(selects[2], "hidden", "change");

    expect(completed).toHaveBeenCalledWith("completed");
    expect(visibility).toHaveBeenCalledWith("hidden");
  });

  it("reports both ends of the occurred-between range", () => {
    const from = vi.fn();
    const to = vi.fn();
    fixture.componentInstance.dateFromInput.subscribe(from);
    fixture.componentInstance.dateToInput.subscribe(to);

    edit(root.querySelector("[aria-label='Occurred from date']"), "2026-10-01", "input");
    edit(root.querySelector("[aria-label='Occurred to date']"), "2026-10-31", "input");

    expect(from).toHaveBeenCalledWith("2026-10-01");
    expect(to).toHaveBeenCalledWith("2026-10-31");
  });
});
