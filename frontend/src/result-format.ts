import type { ReportPayload } from "./types";

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
Format the recommended GPU class for the hero card.
@param tier - recommended tier string
@returns a compact "N GB GPU hardware tier" label, or the raw tier text
*/
export function recommendedGpuClass(tier: string): string {
  const short = shortHardwareClass(tier);
  const capacity = leadingCapacity(short);
  return capacity === "" ? short : `${capacity} GPU hardware tier`;
}

// "24 GB high-end consumer class, e.g. RTX 3090 / RTX 4090 class" ->
// "RTX 3090 / RTX 4090 class"; "" when the tier carries no concrete examples
// (no model loaded, or an overflow recommendation with no single-card fit).
/**
@param tier - recommended tier string
@returns the example card list, or "" when the tier has none
*/
export function gpuExamples(tier: string): string {
  const marker = ", e.g. ";
  const index = tier.indexOf(marker);
  return index === -1 ? "" : tier.slice(index + marker.length);
}

/**
Explain the recommendation for the "Why this recommendation" panel.
@param report - the computed report payload
@returns the explanatory sentence for the recommended tier
*/
export function whyText(report: Readonly<ReportPayload>): string {
  const fit = report.recommendedHardware;
  const capacity = leadingCapacity(shortHardwareClass(fit.recommendedTier));
  if (capacity === "") {
    return fit.math;
  }
  return `At an ${fit.usableVramTarget} usable VRAM target, ${report.totalRequiredMemory} requires a GPU with at least ${report.minimumRawVramNeeded} advertised VRAM. The next common class is ${capacity}.`;
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
