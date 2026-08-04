import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClientTesting } from "@angular/common/http/testing";

import { provideHttpClient } from "@angular/common/http";

import { FormUploadComponent } from "./form-upload.component";

describe("FormUploadComponent", () => {
    let component: FormUploadComponent;
    let fixture: ComponentFixture<FormUploadComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FormUploadComponent],
            providers: [provideHttpClient(), provideHttpClientTesting()],
        }).compileComponents();

        fixture = TestBed.createComponent(FormUploadComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
