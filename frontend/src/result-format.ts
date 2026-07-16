import type { FormState, HardwareRecommendation, ReportPayload } from "./types";

export interface FitMeter {
  readonly capacity: string;
  readonly fillPercent: number;
  readonly isOverflow: boolean;
  readonly isTight: boolean;
  readonly summary: string;
}

// A fit consuming 95% or more of the class's usable VRAM shows the dim amber
// tight signal. The estimate already carries the runtime safety buffer and the
// usable-VRAM derate, so only a near-exhausted budget warrants a warning; the
// default 7B/24 GB example at 92% deliberately reads as a comfortable fit.
const TIGHT_FILL_PERCENT = 95;

/**
Drop the ", e.g. ..." example suffix from a recommended-tier string.
@param value - recommended tier string
@returns the tier label without its example clause
*/
function shortHardwareClass(value: string): string {
  const index = value.indexOf(", e.g.");
  return index === -1 ? value : value.slice(0, index);
}

// "24 GB high-end consumer class" -> "24 GB"; "" when the label does not open
// with a numeric capacity (e.g. "No model loaded", or overflow guidance that
// mentions a "320 GB" tier only mid-sentence).
/**
@param value - hardware class label
@returns the leading "N GB" capacity, or "" when the label does not start with one
*/
function leadingCapacity(value: string): string {
  const match = /^\d+ GB/u.exec(value);
  return match === null ? "" : match[0];
}

/**
Format the recommended hardware class for the hero card.
@param tier - recommended tier string
@returns a compact "N GB hardware tier" label, or the raw tier text
*/
export function recommendedGpuClass(tier: string): string {
  const short = shortHardwareClass(tier);
  const capacity = leadingCapacity(short);
  if (capacity === "") {
    return short;
  }
  if (short.includes("sharded")) {
    return short;
  }
  return `${capacity} hardware tier`;
}

/**
Explain the recommendation for the "Why this recommendation" panel.
@param report - the computed report payload
@param runtimeProfile - the selected runtime profile, when known
@returns the explanatory sentence for the recommended tier
*/
export function whyText(
  report: Readonly<ReportPayload>,
  runtimeProfile?: FormState["runtimeProfile"],
): string {
  const fit = report.recommendedHardware;
  const hardwareClass = shortHardwareClass(fit.recommendedTier);
  const capacity = leadingCapacity(hardwareClass);
  // Local / Edge reserves a larger slice of the card for the OS and display,
  // so the advertised-VRAM requirement sits further above the computed total.
  const localNote =
    runtimeProfile === "Local / Edge"
      ? " On Local / Edge, part of local GPU memory stays reserved for the OS and display, so the advertised requirement is higher than the calculated total."
      : "";
  if (capacity === "") {
    return fit.math + localNote;
  }
  if (hardwareClass.includes("sharded")) {
    return `At an ${fit.usableVramTarget} usable VRAM target, ${report.totalRequiredMemory} requires a sharded GPU pool with at least ${report.minimumRawVramNeeded} aggregate advertised VRAM. The next common sharded class is ${capacity}.${localNote}`;
  }
  return `At an ${fit.usableVramTarget} usable memory target, ${report.totalRequiredMemory} requires hardware with at least ${report.minimumRawVramNeeded} accelerator memory. The hardware tier has capacity ${capacity}.${localNote}`;
}

/**
Parse a leading "N.N GB" measurement from a formatted value.
@param value - a formatted memory string such as "20.4 GB" or "n/a"
@returns the numeric gigabytes, or null when the value carries no measurement
*/
function leadingGb(value: string): number | null {
  const match = /^(\d+\.\d+) GB/u.exec(value);
  return match === null ? null : Number(match[1]);
}

/**
Name the physical surface behind a fit summary.
@param fit - the hardware recommendation being summarized
@param capacity - the leading capacity label
@returns a human noun phrase such as "24 GB card" or "36 GB system"
*/
function fitSurface(
  fit: Readonly<HardwareRecommendation>,
  capacity: string,
): string {
  if (fit.recommendedTier.includes("sharded")) {
    return `${capacity} sharded pool`;
  }
  if (
    fit.exampleCards.length > 0 &&
    fit.exampleCards.every((card) => card.name.includes("TPU"))
  ) {
    return `${capacity} accelerator`;
  }
  if (
    fit.exampleCards.length > 0 &&
    fit.exampleCards.every((card) => card.name.startsWith("Mac "))
  ) {
    return `${capacity} system`;
  }
  return `${capacity} card`;
}

/**
Summarize how much of the recommended GPU class the workload consumes so the
hero can show an at-a-glance fit meter. Returns null when there is no concrete
single-class fit to measure (no model loaded, or an overflow recommendation
whose usable VRAM on class is "n/a").
@param fit - the computed hardware recommendation
@returns the meter fill percent and a plain-language fit summary, or null
*/
export function fitMeter(
  fit: Readonly<HardwareRecommendation>,
): FitMeter | null {
  const usable = leadingGb(fit.usableVramOnClass);
  const required = leadingGb(fit.requiredMemory);
  const capacity = leadingCapacity(shortHardwareClass(fit.recommendedTier));
  if (usable === null || usable <= 0 || required === null || capacity === "") {
    // A real estimate with no single-class fit still renders as a meter:
    // pegged full and red. Only a missing estimate hides the bar entirely.
    // (required is parsed from the always-formatted requiredMemory string, so
    // Number(null) never actually occurs; it just avoids a dead null branch.)
    if (Number(required) > 0) {
      return {
        capacity: "",
        fillPercent: 100,
        isOverflow: true,
        isTight: false,
        summary: `+100% usage. The workload needs ${fit.requiredMemory} usable VRAM.`,
      };
    }
    return null;
  }
  const fillPercent = Math.min(
    100,
    Math.max(0, Math.round((required / usable) * 100)),
  );
  const surface = fitSurface(fit, capacity);
  const isTight = fillPercent >= TIGHT_FILL_PERCENT;
  // The percent is measured against the class's usable VRAM, not its sticker
  // capacity, so both the sentence and the scale row name that budget to keep
  // the math traceable from the hero number. A tight fit leads with a
  // plain-language cue so the amber bar never carries the warning by color.
  const usage = `${fit.requiredMemory} uses ${fillPercent.toString()}% of its ${fit.usableVramOnClass} usable VRAM`;
  const summary = isTight
    ? `Tight fit on one ${surface}: ${usage}.`
    : `Fits on one ${surface}: ${usage}.`;
  return {
    capacity: `${fit.usableVramOnClass} usable of ${capacity}`,
    fillPercent,
    isOverflow: false,
    isTight,
    summary,
  };
}

/**
Normalize the speed string to the compact "/sec" form used in the UI.
@param speed - raw speed estimate
@returns the speed with "/second" shortened to "/sec"
*/
export function formatSpeed(speed: string): string {
  return speed.replaceAll("/second", "/sec");
}

/**
Build the speed row label from the workload's rendered speed unit.
@param speed - raw speed estimate
@returns a "Estimated Speed (unit)" label
*/
export function speedLabel(speed: string): string {
  const formatted = formatSpeed(speed);
  const unit = formatted.replace(/^[\d.]+ /u, "");
  return `Estimated Speed (${unit.replaceAll("/minute", "/min")})`;
}
