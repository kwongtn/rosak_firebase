import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SpottingFormComponent } from "./spotting-form.component";

describe("SpottingFormComponent", () => {
    let component: SpottingFormComponent;
    let fixture: ComponentFixture<SpottingFormComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [SpottingFormComponent],
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(SpottingFormComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
