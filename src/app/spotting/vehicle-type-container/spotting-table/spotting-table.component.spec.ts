import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SpottingTableComponent } from "./spotting-table.component";

describe("SpottingTableComponent", () => {
    let component: SpottingTableComponent;
    let fixture: ComponentFixture<SpottingTableComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [SpottingTableComponent],
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(SpottingTableComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
