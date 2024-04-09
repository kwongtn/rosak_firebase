import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
    VerificationCodeCardComponent,
} from "./verification-code-card.component";

describe("VerificationCodeCardComponent", () => {
    let component: VerificationCodeCardComponent;
    let fixture: ComponentFixture<VerificationCodeCardComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [VerificationCodeCardComponent]
        })
            .compileComponents();
    
        fixture = TestBed.createComponent(VerificationCodeCardComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
