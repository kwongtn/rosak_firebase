import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SpottingImageListComponent } from "./spotting-image-list.component";

describe("SpottingImageListComponent", () => {
    let component: SpottingImageListComponent;
    let fixture: ComponentFixture<SpottingImageListComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [SpottingImageListComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(SpottingImageListComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
