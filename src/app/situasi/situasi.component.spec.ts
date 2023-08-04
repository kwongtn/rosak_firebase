import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SituasiComponent } from "./situasi.component";

describe("SituasiComponent", () => {
    let component: SituasiComponent;
    let fixture: ComponentFixture<SituasiComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [SituasiComponent],
        });
        fixture = TestBed.createComponent(SituasiComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
