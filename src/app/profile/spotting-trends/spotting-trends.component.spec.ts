import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SpottingTrendsComponent } from "./spotting-trends.component";

describe("SpottingTrendsComponent", () => {
    let component: SpottingTrendsComponent;
    let fixture: ComponentFixture<SpottingTrendsComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [SpottingTrendsComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(SpottingTrendsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
