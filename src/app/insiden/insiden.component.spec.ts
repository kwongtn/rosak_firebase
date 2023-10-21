import { ComponentFixture, TestBed } from "@angular/core/testing";

import { InsidenMainComponent } from "./insiden.component";

describe("InsidenMainComponent", () => {
    let component: InsidenMainComponent;
    let fixture: ComponentFixture<InsidenMainComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [InsidenMainComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(InsidenMainComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
