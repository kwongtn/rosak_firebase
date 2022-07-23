import { VehicleStatusPipePipe } from "./vehicle-status-pipe.pipe";

describe("VehicleStatusPipePipe", () => {
    it("create an instance", () => {
        const pipe = new VehicleStatusPipePipe();
        expect(pipe).toBeTruthy();
    });
});
