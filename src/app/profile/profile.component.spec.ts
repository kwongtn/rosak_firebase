import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ProfileMainComponent } from "./profile.component";

describe("ProfileMainComponent", () => {
    let component: ProfileMainComponent;
    let fixture: ComponentFixture<ProfileMainComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ProfileMainComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ProfileMainComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
