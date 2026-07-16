// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { sanitizeNumberInput } from "./input-sanitizer";

/**
Build a decimal text input carrying the value under test.
@param value - raw user-entered value
@returns the input ready for sanitation
*/
function decimalInput(value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.inputMode = "decimal";
  input.value = value;
  return input;
}

describe("sanitizeNumberInput", () => {
  test("keeps two decimal digits in decimal text inputs", () => {
    const input = decimalInput("0.759");

    sanitizeNumberInput(input);

    expect(input.value).toBe("0.75");
  });

  test("keeps one decimal point when a decimal text input has extra dots", () => {
    const input = decimalInput("1.23.4");

    sanitizeNumberInput(input);

    expect(input.value).toBe("1.23");
  });
});
