import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ImageDrawerComponent } from "./image-drawer.component";

describe("ImageDrawerComponent", () => {
    let component: ImageDrawerComponent;
    let fixture: ComponentFixture<ImageDrawerComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [ImageDrawerComponent],
        });
        fixture = TestBed.createComponent(ImageDrawerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
