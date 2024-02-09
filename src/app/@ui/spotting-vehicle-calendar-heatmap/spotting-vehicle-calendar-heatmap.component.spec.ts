import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SpottingVehicleCalendarHeatmapComponent } from "./spotting-vehicle-calendar-heatmap.component";

describe("SpottingVehicleCalendarHeatmapComponent", () => {
    let component: SpottingVehicleCalendarHeatmapComponent;
    let fixture: ComponentFixture<SpottingVehicleCalendarHeatmapComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [SpottingVehicleCalendarHeatmapComponent]
        });
        fixture = TestBed.createComponent(SpottingVehicleCalendarHeatmapComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
