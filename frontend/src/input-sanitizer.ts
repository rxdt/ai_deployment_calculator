const NUMBER_MAX = 99_999_999.9;

/**
@param input
*/
function inputMaximum(input: HTMLInputElement): number {
  const configured = input.dataset.numberMax;
  if (configured === undefined) {
    return NUMBER_MAX;
  }
  const parsed = Number(configured);
  return Number.isFinite(parsed) ? Math.min(parsed, NUMBER_MAX) : NUMBER_MAX;
}

/**
@param maximum
@param inputMode
*/
function cappedValue(maximum: number, inputMode: string): string {
  return inputMode === "decimal" && !Number.isSafeInteger(maximum)
    ? maximum.toFixed(1)
    : String(Math.trunc(maximum));
}

/**
@param input
*/
export function sanitizeNumberInput(input: HTMLInputElement): void {
  const digitsOnly = input.value.replaceAll(/[^\d.]/gu, "");
  const [integer = "", ...fractions] = digitsOnly.split(".");
  const isDecimal = input.inputMode === "decimal";
  let next =
    isDecimal && fractions.length > 0
      ? `${integer}.${fractions.join("").slice(0, 1)}`
      : integer;
  const maximum = inputMaximum(input);
  if (next !== "" && Number(next) > maximum) {
    next = cappedValue(maximum, input.inputMode);
  }
  if (input.value !== next) {
    input.value = next;
  }
}
