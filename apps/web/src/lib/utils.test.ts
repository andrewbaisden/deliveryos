import { describe, expect, it } from "vitest";
import { humanise, statusTone } from "./utils";

describe("presentation helpers", () => {
  it("humanises operational enums", () =>
    expect(humanise("EN_ROUTE_TO_PICKUP")).toBe("En route to pickup"));
  it("never represents delayed state as positive", () =>
    expect(statusTone("DELAYED")).toBe("danger"));
});
