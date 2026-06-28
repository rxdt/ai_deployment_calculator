import type { WorkloadFamily } from "./types";

const FAMILY_OPTIONS: readonly [WorkloadFamily, string][] = [
  ["text_generation", "Text generation / chat"],
  ["text_encoder", "Text embeddings / reranking / classification"],
  ["encoder_decoder", "Encoder-decoder generation"],
  ["vision", "Vision understanding"],
  ["vision_language", "Vision-language / multimodal"],
  ["image_diffusion", "Image generation / diffusion"],
  ["video_generation", "Video generation"],
  ["audio", "Speech / audio"],
  ["tabular", "Tabular / classical ML"],
  ["custom", "Custom / unknown"],
];

export function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

export function checked(isChecked: boolean): string {
  return isChecked ? " checked" : "";
}

function selected(value: string, current: string): string {
  return value === current ? " selected" : "";
}

export function options(values: readonly string[], current: string): string {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${selected(value, current)}>${escapeHtml(value)}</option>`,
    )
    .join("");
}

export function labelledOptions(
  values: readonly [string, string][],
  current: string,
): string {
  return values
    .map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}"${selected(value, current)}>${escapeHtml(label)}</option>`,
    )
    .join("");
}

export function familyOptions(current: WorkloadFamily): string {
  return FAMILY_OPTIONS.map(
    ([value, label]) =>
      `<option value="${value}"${selected(value, current)}>${label}</option>`,
  ).join("");
}
