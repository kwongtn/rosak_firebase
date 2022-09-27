import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
    VehicleTableCellDisplayComponent,
} from "./vehicle-table-cell-display.component";

describe("VehicleTableCellDisplayComponent", () => {
    let component: VehicleTableCellDisplayComponent;
    let fixture: ComponentFixture<VehicleTableCellDisplayComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [VehicleTableCellDisplayComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(VehicleTableCellDisplayComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
