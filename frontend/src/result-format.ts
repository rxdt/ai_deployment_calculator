import type { HardwareRecommendation, ReportPayload } from "./types";

export interface FitMeter {
  readonly fillPercent: number;
  readonly isTight: boolean;
  readonly summary: string;
}

// The recommended class is the tightest standard tier that fits, so healthy fits
// already sit high on the meter. Reserve the tight signal for a fit consuming at
// least 95% of usable VRAM (<=5% spare after the usable-VRAM reserve), where
// real-world fragmentation could push it over. The default 7B/24 GB example sits
// at 93% and stays healthy.
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
Format the recommended GPU class for the hero card.
@param tier - recommended tier string
@returns a compact "N GB GPU hardware tier" label, or the raw tier text
*/
export function recommendedGpuClass(tier: string): string {
  const short = shortHardwareClass(tier);
  const capacity = leadingCapacity(short);
  if (capacity === "") {
    return short;
  }
  // Aggregate sharded tiers are several GPUs, not one card of this capacity.
  // Collapsing them to "N GB GPU hardware tier" would imply a single GPU that
  // does not exist, so keep the descriptive "sharded" label instead.
  if (short.includes("sharded")) {
    return short;
  }
  return `${capacity} GPU hardware tier`;
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
  const hardwareClass = shortHardwareClass(fit.recommendedTier);
  const capacity = leadingCapacity(hardwareClass);
  if (capacity === "") {
    return fit.math;
  }
  if (hardwareClass.includes("sharded")) {
    return `At an ${fit.usableVramTarget} usable VRAM target, ${report.totalRequiredMemory} requires a sharded GPU pool with at least ${report.minimumRawVramNeeded} aggregate advertised VRAM. The next common sharded class is ${capacity}.`;
  }
  return `At an ${fit.usableVramTarget} usable VRAM target, ${report.totalRequiredMemory} requires a GPU with at least ${report.minimumRawVramNeeded} advertised VRAM. The next common class is ${capacity}.`;
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
    return null;
  }
  const fillPercent = Math.min(
    100,
    Math.max(0, Math.round((required / usable) * 100)),
  );
  const sparePercent = 100 - fillPercent;
  const headroom = fit.fitHeadroom.replace(" usable margin", "");
  const surface = fit.recommendedTier.includes("sharded")
    ? `${capacity} sharded pool`
    : `${capacity} card`;
  const isTight = fillPercent >= TIGHT_FILL_PERCENT;
  // A tight fit leads with a plain-language cue so the amber bar never carries
  // the warning by color alone.
  const summary = isTight
    ? `Tight fit: ${headroom} usable headroom on a ${surface} (${sparePercent.toString()}% spare).`
    : `Fits a ${surface} with ${headroom} usable headroom (${sparePercent.toString()}% spare).`;
  return { fillPercent, isTight, summary };
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
