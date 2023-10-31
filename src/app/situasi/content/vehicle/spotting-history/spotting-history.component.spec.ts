import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SpottingHistoryComponent } from "./spotting-history.component";

describe("SpottingHistoryComponent", () => {
    let component: SpottingHistoryComponent;
    let fixture: ComponentFixture<SpottingHistoryComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [SpottingHistoryComponent],
        });
        fixture = TestBed.createComponent(SpottingHistoryComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
