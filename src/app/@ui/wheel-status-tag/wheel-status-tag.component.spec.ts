import { ComponentFixture, TestBed } from "@angular/core/testing";

import { WheelStatusTagComponent } from "./wheel-status-tag.component";

describe("WheelStatusTagComponent", () => {
    let component: WheelStatusTagComponent;
    let fixture: ComponentFixture<WheelStatusTagComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [WheelStatusTagComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(WheelStatusTagComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
