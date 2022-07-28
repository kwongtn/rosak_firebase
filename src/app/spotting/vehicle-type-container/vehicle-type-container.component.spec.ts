import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
    VehicleTypeContainerComponent,
} from "./vehicle-type-container.component";

describe("VehicleTypeContainerComponent", () => {
    let component: VehicleTypeContainerComponent;
    let fixture: ComponentFixture<VehicleTypeContainerComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [VehicleTypeContainerComponent],
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(VehicleTypeContainerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
