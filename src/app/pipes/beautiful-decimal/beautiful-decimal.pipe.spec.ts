import { BeautifulDecimalPipe } from "./beautiful-decimal.pipe";

describe("BeautifulDecimalPipe", () => {
    it("create an instance", () => {
        const pipe = new BeautifulDecimalPipe();
        expect(pipe).toBeTruthy();
    });
});
