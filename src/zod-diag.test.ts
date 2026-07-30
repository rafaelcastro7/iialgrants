import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("zod diag", () => {
  it("z is defined", () => {
    console.log("typeof z", typeof z, z);
    expect(z).toBeDefined();
    expect(typeof z.object).toBe("function");
  });
});
