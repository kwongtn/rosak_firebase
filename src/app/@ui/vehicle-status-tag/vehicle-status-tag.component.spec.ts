import { ComponentFixture, TestBed } from "@angular/core/testing";

import { VehicleStatusTagComponent } from "./vehicle-status-tag.component";

describe("VehicleStatusTagComponent", () => {
    let component: VehicleStatusTagComponent;
    let fixture: ComponentFixture<VehicleStatusTagComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [VehicleStatusTagComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(VehicleStatusTagComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
