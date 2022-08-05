import { ComponentFixture, TestBed } from "@angular/core/testing";

import { TechstackCardComponent } from "./techstack-card.component";

describe("TechstackCardComponent", () => {
    let component: TechstackCardComponent;
    let fixture: ComponentFixture<TechstackCardComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [TechstackCardComponent],
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(TechstackCardComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
