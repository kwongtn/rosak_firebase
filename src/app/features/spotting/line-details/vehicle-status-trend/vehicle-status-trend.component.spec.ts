import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, describe, expect, it } from "vitest";

import { ANONYMOUS } from "../../../../core/http/auth.interceptor";
import { VehicleStatusTrendComponent } from "./vehicle-status-trend.component";

describe("VehicleStatusTrendComponent", () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it("asks for the public counts without the viewer's token, so SSR can hand them over", () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(VehicleStatusTrendComponent);
    fixture.componentRef.setInput("lineId", "1");
    fixture.detectChanges();
    TestBed.tick();

    const call = TestBed.inject(HttpTestingController).expectOne((request) =>
      request.url.includes("operation/line_vehicles_status_trend_count/1/"),
    );
    expect(call.request.context.get(ANONYMOUS)).toBe(true);
    call.flush([]);
  });
});
