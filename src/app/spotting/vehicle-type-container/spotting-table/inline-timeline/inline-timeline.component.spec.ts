import { ComponentFixture, TestBed } from "@angular/core/testing";

import { InlineTimelineComponent } from "./inline-timeline.component";

describe("InlineTimelineComponent", () => {
    let component: InlineTimelineComponent;
    let fixture: ComponentFixture<InlineTimelineComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [InlineTimelineComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(InlineTimelineComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
