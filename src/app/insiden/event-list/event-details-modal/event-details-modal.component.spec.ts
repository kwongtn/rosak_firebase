import { ComponentFixture, TestBed } from "@angular/core/testing";

import { EventDetailsModalComponent } from "./event-details-modal.component";

describe("EventDetailsModalComponent", () => {
    let component: EventDetailsModalComponent;
    let fixture: ComponentFixture<EventDetailsModalComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [EventDetailsModalComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(EventDetailsModalComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
