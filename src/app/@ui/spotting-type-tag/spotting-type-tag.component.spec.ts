import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SpottingTypeTagComponent } from "./spotting-type-tag.component";
import { SpottingTypeTagModule } from "./spotting-type-tag.module";

describe("SpottingTypeTagComponent", () => {
    let component: SpottingTypeTagComponent;
    let fixture: ComponentFixture<SpottingTypeTagComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SpottingTypeTagModule],
        }).compileComponents();

        fixture = TestBed.createComponent(SpottingTypeTagComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
