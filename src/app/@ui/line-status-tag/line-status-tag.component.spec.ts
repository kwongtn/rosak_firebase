import { ComponentFixture, TestBed } from "@angular/core/testing";

import { LineStatusTagComponent } from "./line-status-tag.component";

describe("LineStatusTagComponent", () => {
    let component: LineStatusTagComponent;
    let fixture: ComponentFixture<LineStatusTagComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [LineStatusTagComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(LineStatusTagComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
