import { VehicleStatusPipe } from "./vehicle-status.pipe";

describe("VehicleStatusPipe", () => {
    it("create an instance", () => {
        const pipe = new VehicleStatusPipe();
        expect(pipe).toBeTruthy();
    });
});
