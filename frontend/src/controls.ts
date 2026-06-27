import type { WorkloadFamily } from "./types";

const MOE_FAMILIES = new Set<WorkloadFamily>([
  "text_generation",
  "text_encoder",
  "encoder_decoder",
  "vision_language",
  "custom",
]);

export function familySupportsMoe(family: WorkloadFamily): boolean {
  return MOE_FAMILIES.has(family);
}

export function isTrainingMode(mode: string): boolean {
  return mode !== "Inference";
}

export function syncConditionalControls(app: HTMLDivElement): void {
  const family = app.querySelector<HTMLSelectElement>(
    'select[name="workload_family"]',
  );
  const mode = app.querySelector<HTMLSelectElement>(
    'select[name="execution_mode"]',
  );
  const moe = app.querySelector<HTMLInputElement>('input[name="moe_enabled"]');
  const active = app.querySelector<HTMLInputElement>(
    'input[name="active_params"]',
  );
  const workload = app.querySelector<HTMLElement>("[data-workload-label]");
  if (family !== null && moe !== null && active !== null) {
    const supportsMoe = familySupportsMoe(family.value as WorkloadFamily);
    moe
      .closest<HTMLElement>(".moe-control")
      ?.toggleAttribute("hidden", !supportsMoe);
    if (!supportsMoe) {
      moe.checked = false;
    }
    active
      .closest<HTMLElement>(".active-params")
      ?.toggleAttribute("hidden", !supportsMoe || !moe.checked);
  }
  if (mode !== null && workload !== null) {
    workload.textContent = isTrainingMode(mode.value)
      ? "Micro Batch Size"
      : "Concurrent Requests";
  }
}
