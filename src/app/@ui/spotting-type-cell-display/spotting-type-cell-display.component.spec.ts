import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
    SpottingTypeCellDisplayComponent,
} from "./spotting-type-cell-display.component";

describe("SpottingTypeCellDisplayComponent", () => {
    let component: SpottingTypeCellDisplayComponent;
    let fixture: ComponentFixture<SpottingTypeCellDisplayComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [SpottingTypeCellDisplayComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(SpottingTypeCellDisplayComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
