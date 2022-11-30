import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ProfileUserComponent } from "./user.component";

describe("ProfileUserComponent", () => {
    let component: ProfileUserComponent;
    let fixture: ComponentFixture<ProfileUserComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ProfileUserComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ProfileUserComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
