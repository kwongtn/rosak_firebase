import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
    VehicleTableCellDisplayComponent,
} from "./vehicle-table-cell-display.component";

describe("VehicleTableCellDisplayComponent", () => {
    let component: VehicleTableCellDisplayComponent;
    let fixture: ComponentFixture<VehicleTableCellDisplayComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [VehicleTableCellDisplayComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(VehicleTableCellDisplayComponent);
        component = fixture.componentInstance;
        component.vehicleData = {
            id: "1",
            status: "IN_SERVICE",
            identificationNo: "TEST-1",
            notes: "",
            vehicleType: { internalName: "Test" },
            lines: [{ code: "T1" }],
        };
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
