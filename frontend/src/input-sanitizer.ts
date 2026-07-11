const NUMBER_MAX = 99_999_999.9;

// The single definition of "not part of a number": the beforeinput guard
// blocks exactly what the sanitizer backstop would strip, so the two layers
// can never drift apart.
const NON_NUMERIC = /[^\d.]/u;

/**
Read the input's configured ceiling, bounded by the app-wide maximum.
@param input - the numeric input carrying an optional data-number-max
@returns the effective maximum value
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
Format a clamped maximum in the field's own style (decimal or integer).
@param maximum - the effective maximum value
@param inputMode - the input's inputmode attribute
@returns the maximum as field text
*/
function cappedValue(maximum: number, inputMode: string): string {
  return inputMode === "decimal" && !Number.isSafeInteger(maximum)
    ? maximum.toFixed(1)
    : String(Math.trunc(maximum));
}

/**
Reject any insertion that would put a non-numeric character into a numeric
field, before it lands. Blocking at beforeinput (rather than stripping after
the fact) means a typed or pasted "e", "-", or unit suffix visibly does
nothing, so the field never silently transforms what the user entered.
@param event - the form's beforeinput event
*/
export function guardNumericInsertion(event: Event): void {
  if (
    !(event instanceof InputEvent) ||
    !(event.target instanceof HTMLInputElement) ||
    event.target.inputMode === ""
  ) {
    return;
  }
  if (event.data !== null && NON_NUMERIC.test(event.data)) {
    event.preventDefault();
  }
}

/**
Clamp a sanitized value into the input's configured [min, max] range. The
floor normalizes visibly: typing "0" into a min-1 field shows "1", so the
form always displays the number the estimate uses.
@param next - the sanitized candidate value
@param input - the numeric input carrying optional data-number-min/max
@returns the candidate held within the configured range
*/
function clampedToRange(next: string, input: HTMLInputElement): string {
  if (next === "") {
    return next;
  }
  const maximum = inputMaximum(input);
  if (Number(next) > maximum) {
    return cappedValue(maximum, input.inputMode);
  }
  const minimum = Number(input.dataset.numberMin ?? "0");
  return Number(next) < minimum ? String(minimum) : next;
}

/**
Normalize a numeric field's value in place after an edit.
@param input - the numeric input to sanitize
*/
export function sanitizeNumberInput(input: HTMLInputElement): void {
  // Backstop for value changes that bypass beforeinput (drag-and-drop, some
  // IMEs): keep only the leading run of digits-and-dot, dropping everything
  // from the first other character onward rather than deleting it in place, so
  // a pasted "1e9" becomes "1" (never "19") and a leading "-" yields empty.
  const firstOther = input.value.search(NON_NUMERIC);
  const leadingNumber =
    firstOther === -1 ? input.value : input.value.slice(0, firstOther);
  const [integer = "", ...fractions] = leadingNumber.split(".");
  const isDecimal = input.inputMode === "decimal";
  const next = clampedToRange(
    isDecimal && fractions.length > 0
      ? `${integer}.${fractions.join("").slice(0, 1)}`
      : integer,
    input,
  );
  if (input.value !== next) {
    input.value = next;
  }
}
