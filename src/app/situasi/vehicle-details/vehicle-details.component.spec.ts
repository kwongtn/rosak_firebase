import { ComponentFixture, TestBed } from "@angular/core/testing";

import { VehicleDetailsComponent } from "./vehicle-details.component";

describe("VehicleDetailsComponent", () => {
    let component: VehicleDetailsComponent;
    let fixture: ComponentFixture<VehicleDetailsComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [VehicleDetailsComponent],
        });
        fixture = TestBed.createComponent(VehicleDetailsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
