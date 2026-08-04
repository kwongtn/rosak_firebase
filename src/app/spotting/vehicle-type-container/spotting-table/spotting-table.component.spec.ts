import { ComponentFixture, TestBed } from "@angular/core/testing";

import { provideNoopAnimations } from "@angular/platform-browser/animations";

import { SpottingTableComponent } from "./spotting-table.component";

describe("SpottingTableComponent", () => {
    let component: SpottingTableComponent;
    let fixture: ComponentFixture<SpottingTableComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SpottingTableComponent],
            providers: [provideNoopAnimations()],
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(SpottingTableComponent);
        component = fixture.componentInstance;
        component.dataSource = {
            displayName: "Test Vehicle Type",
            vehicleStatusCount: {
                vehicleStatusDecommissionedCount: 0,
                vehicleStatusInServiceCount: 0,
                vehicleStatusNotSpottedCount: 0,
                vehicleStatusOutOfServiceCount: 0,
                vehicleStatusTestingCount: 0,
                vehicleStatusUnknownCount: 0,
                vehicleStatusMarriedCount: 0,
                vehicleTotalCount: 0,
            },
            tableData: [],
        };
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
