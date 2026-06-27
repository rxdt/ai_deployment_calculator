import type { WorkloadFamily } from "./types";

const WORKLOAD_FAMILIES = [
  "text_generation",
  "text_encoder",
  "encoder_decoder",
  "vision",
  "vision_language",
  "image_diffusion",
  "video_generation",
  "audio",
  "tabular",
  "custom",
] satisfies readonly string[];

const MOE_FAMILIES = new Set<WorkloadFamily>([
  "text_generation",
  "text_encoder",
  "encoder_decoder",
  "vision_language",
  "custom",
]);

function isWorkloadFamily(value: string): value is WorkloadFamily {
  return WORKLOAD_FAMILIES.includes(value);
}

export function isFamilySupportsMoe(family: WorkloadFamily): boolean {
  return MOE_FAMILIES.has(family);
}

export function isTrainingMode(mode: string): boolean {
  return mode !== "Inference";
}

function syncMoeControls(app: HTMLDivElement): void {
  const family = app.querySelector<HTMLSelectElement>(
    'select[name="workload_family"]',
  );
  const moe = app.querySelector<HTMLInputElement>('input[name="moe_enabled"]');
  const active = app.querySelector<HTMLInputElement>(
    'input[name="active_params"]',
  );
  if (family !== null && moe !== null && active !== null) {
    const isSupportsMoe =
      isWorkloadFamily(family.value) && isFamilySupportsMoe(family.value);
    moe
      .closest<HTMLElement>(".moe-control")
      ?.toggleAttribute("hidden", !isSupportsMoe);
    if (!isSupportsMoe) {
      moe.checked = false;
    }
    active
      .closest<HTMLElement>(".active-params")
      ?.toggleAttribute("hidden", !isSupportsMoe || !moe.checked);
  }
}

function syncWorkloadLabel(app: HTMLDivElement): void {
  const mode = app.querySelector<HTMLSelectElement>(
    'select[name="execution_mode"]',
  );
  const workload = app.querySelector<HTMLElement>("[data-workload-label]");
  if (mode !== null && workload !== null) {
    workload.textContent = isTrainingMode(mode.value)
      ? "Micro Batch Size"
      : "Concurrent Requests";
  }
}

export function syncConditionalControls(app: HTMLDivElement): void {
  syncMoeControls(app);
  syncWorkloadLabel(app);
}
