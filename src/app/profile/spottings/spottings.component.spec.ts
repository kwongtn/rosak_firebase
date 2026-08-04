import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ProfileSpottingsComponent } from "./spottings.component";

describe("ProfileSpottingsComponent", () => {
    let component: ProfileSpottingsComponent;
    let fixture: ComponentFixture<ProfileSpottingsComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ProfileSpottingsComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ProfileSpottingsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
