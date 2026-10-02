import { describe, expect, it } from "vitest";
import { safeRedirect } from "./urls";

describe("safeRedirect", () => {
  it("allows same-site paths only", () => {
    expect(safeRedirect("/register")).toBe("/register");
    expect(safeRedirect("//evil.example")).toBe("/dashboard");
    expect(safeRedirect("/\\evil.example")).toBe("/dashboard");
    expect(safeRedirect("https://evil.example")).toBe("/dashboard");
    expect(safeRedirect(undefined, "/")).toBe("/");
  });
});
