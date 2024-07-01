import { ComponentFixture, TestBed } from "@angular/core/testing";

import { PanelRtLayerComponent } from "./panel-rt-layer.component";

describe("PanelRtLayerComponent", () => {
    let component: PanelRtLayerComponent;
    let fixture: ComponentFixture<PanelRtLayerComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PanelRtLayerComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(PanelRtLayerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it("should create", () => {
        expect(component).toBeTruthy();
    });
});
