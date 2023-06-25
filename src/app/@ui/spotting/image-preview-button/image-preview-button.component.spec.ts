import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ImagePreviewButtonComponent } from "./image-preview-button.component";

describe("ImagePreviewButtonComponent", () => {
    let component: ImagePreviewButtonComponent;
    let fixture: ComponentFixture<ImagePreviewButtonComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ImagePreviewButtonComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(ImagePreviewButtonComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
