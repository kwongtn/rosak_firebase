import { CoordinatesHumanizerPipe } from "./coordinates-humanizer.pipe";

describe("CoordinatesHumanizerPipe", () => {
    it("create an instance", () => {
        const pipe = new CoordinatesHumanizerPipe();
        expect(pipe).toBeTruthy();
    });
});
