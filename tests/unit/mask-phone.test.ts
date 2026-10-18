import { describe, expect, it } from "vitest";
import { maskPhone } from "@/server/domains/sms/mask-phone";

describe("maskPhone", () => {
  it("keeps only the last two digits visible", () => {
    expect(maskPhone("+33612345678")).toBe("*********78");
  });

  it("strips non-digit characters before masking", () => {
    expect(maskPhone("06 12 34 56 78")).toBe(maskPhone("0612345678"));
  });

  it("masks everything for a number with two digits or fewer, rather than revealing it whole", () => {
    expect(maskPhone("12")).toBe("**");
    expect(maskPhone("1")).toBe("*");
    expect(maskPhone("")).toBe("");
  });
});
