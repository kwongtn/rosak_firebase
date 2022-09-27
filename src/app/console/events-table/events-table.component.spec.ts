import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ConsoleEventsTableComponent } from "./events-table.component";

describe("ConsoleEventsTableComponent", () => {
    let component: ConsoleEventsTableComponent;
    let fixture: ComponentFixture<ConsoleEventsTableComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ConsoleEventsTableComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ConsoleEventsTableComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
