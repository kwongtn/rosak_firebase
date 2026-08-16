import { HttpErrorResponse } from "@angular/common/http";
import { is404Error } from "./app.config";

describe("is404Error", () => {
  it("should identify HttpErrorResponse with 404 status", () => {
    const err = new HttpErrorResponse({ status: 404, statusText: "Not Found" });
    expect(is404Error(err)).toBe(true);
  });

  it("should identify wrapped HttpErrorResponse with 404 status", () => {
    const err = { ngOriginalError: new HttpErrorResponse({ status: 404 }) };
    expect(is404Error(err)).toBe(true);
  });

  it("should identify error object with status 404", () => {
    expect(is404Error({ status: 404 })).toBe(true);
    expect(is404Error({ statusCode: 404 })).toBe(true);
  });

  it("should identify error messages mentioning 404", () => {
    expect(is404Error("Server returned code 404")).toBe(true);
    expect(is404Error(new Error("Resource not found: 404"))).toBe(true);
  });

  it("should return false for other errors", () => {
    expect(is404Error(new HttpErrorResponse({ status: 500 }))).toBe(false);
    expect(is404Error(new Error("Something went wrong"))).toBe(false);
    expect(is404Error(null)).toBe(false);
    expect(is404Error(undefined)).toBe(false);
  });
});
