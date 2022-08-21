import { ComponentFixture, TestBed } from "@angular/core/testing";

import { InlineHistoryComponent } from "./inline-history.component";

describe("InlineHistoryComponent", () => {
    let component: InlineHistoryComponent;
    let fixture: ComponentFixture<InlineHistoryComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [InlineHistoryComponent],
        }).compileComponents();
    });

    beforeEach(() => {
        fixture = TestBed.createComponent(InlineHistoryComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
