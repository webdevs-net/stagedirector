import { describe, expect, it } from "vitest";
import { previewHref } from "./previewHref";

describe("previewHref", () => {
  it("adds as=developer and keeps other params", () => {
    expect(previewHref("/p/a~b", { stage: "staging" }, "developer")).toBe("/p/a~b?stage=staging&as=developer#preview-as");
  });
  it("drops as for the owner view", () => {
    expect(previewHref("/p/a~b", { as: "developer", x: "1" }, "code-owner")).toBe("/p/a~b?x=1#preview-as");
    expect(previewHref("/p/a~b", { as: "developer" }, "code-owner")).toBe("/p/a~b#preview-as");
  });
});
