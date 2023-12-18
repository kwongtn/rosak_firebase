import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
    VehicleStatusHistoryComponent,
} from "./vehicle-status-history.component";

describe("VehicleStatusHistoryComponent", () => {
    let component: VehicleStatusHistoryComponent;
    let fixture: ComponentFixture<VehicleStatusHistoryComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [VehicleStatusHistoryComponent],
        });
        fixture = TestBed.createComponent(VehicleStatusHistoryComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
