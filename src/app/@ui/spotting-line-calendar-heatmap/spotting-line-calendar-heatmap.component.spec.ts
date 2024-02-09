import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
    SpottingLineCalendarHeatmapComponent,
} from "./spotting-line-calendar-heatmap.component";

describe("SpottingHistoryComponent", () => {
    let component: SpottingLineCalendarHeatmapComponent;
    let fixture: ComponentFixture<SpottingLineCalendarHeatmapComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [SpottingLineCalendarHeatmapComponent],
        });
        fixture = TestBed.createComponent(SpottingLineCalendarHeatmapComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
