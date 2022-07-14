import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SpottingMainComponent } from "./spotting-main.component";

describe("SpottingMainComponent", () => {
    let component: SpottingMainComponent;
    let fixture: ComponentFixture<SpottingMainComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [SpottingMainComponent],
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(SpottingMainComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
