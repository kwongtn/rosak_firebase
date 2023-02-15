import { ComponentFixture, TestBed } from "@angular/core/testing";

import { JejakMainComponent } from "./main.component";

describe("JejakMainComponent", () => {
    let component: JejakMainComponent;
    let fixture: ComponentFixture<JejakMainComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [JejakMainComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(JejakMainComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
