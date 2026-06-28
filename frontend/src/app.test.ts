import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CalculatorApp,
  buildReport,
  defaultState,
  isReportPayload,
  mountCalculator,
  normalizedState,
  renderResults,
  searchFromState,
  type BrowserRuntime,
  type FormState,
} from "./app";
import { syncConditionalControls } from "./controls";
import { renderForm, renderStatusBar } from "./render";

function appRoot(): HTMLDivElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}

function runtime(search = ""): BrowserRuntime {
  return {
    history: { replaceState: vi.fn() },
    location: { search },
  };
}

function state(overrides: Partial<FormState> = {}): FormState {
  return Object.assign(defaultState(), overrides);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("state normalization", () => {
  test("uses defaults for empty or invalid query values", () => {
    expect(normalizedState(new URLSearchParams())).toEqual(defaultState());
    expect(
      normalizedState(
        new URLSearchParams({
          workload_family: "bad",
          total_params: "0",
          parameter_unit: "bad",
          precision: "3-bit",
          execution_mode: "trained=on",
          runtime_profile: "bad",
          workload_size: "-1",
          context_tokens: "0x10",
          video_resolution: "4k",
          optimizer: "bad",
        }),
      ),
    ).toEqual(defaultState());
  });

  test("accepts last repeated valid values and boolean flags", () => {
    const normalized = normalizedState(
      new URLSearchParams(
        "total_params=bad&total_params=70&parameter_unit=B&precision=4-bit&execution_mode=QLoRA+fine-tuning&runtime_profile=Local+%2F+Edge&workload_size=2&moe_enabled=ON&active_params=8&gradient_checkpointing=false&exact_transformer_architecture=1&known_model_file_size_gb=35&cloud_cost_override=3.5",
      ),
    );

    expect(normalized).toMatchObject({
      total_params: "70",
      precision: "4-bit",
      execution_mode: "QLoRA fine-tuning",
      runtime_profile: "Local / Edge",
      workload_size: "2",
      moe_enabled: true,
      active_params: "8",
      gradient_checkpointing: false,
      exact_transformer_architecture: true,
      known_model_file_size_gb: "35",
      cloud_cost_override: "3.5",
    });
  });

  test("serializes only meaningful query values", () => {
    const search = searchFromState(
      state({
        moe_enabled: true,
        exact_transformer_architecture: true,
        known_model_file_size_gb: "",
      }),
    );

    expect(search.get("moe_enabled")).toBe("on");
    expect(search.get("exact_transformer_architecture")).toBe("on");
    expect(search.get("known_model_file_size_gb")).toBeNull();
    expect(search.get("workload_family")).toBe("text_generation");
  });
});

describe("rendering and validation", () => {
  test("validates the report payload and rejects malformed reports", () => {
    const report = buildReport(state());
    const emptyRequired = buildReport(state());
    const nullHardware = buildReport(state());
    const numericCloudCost = buildReport(state());
    const invalidAccuracy = buildReport(state());
    const emptyBreakdown = buildReport(state());
    const emptyAssumptions = buildReport(state());
    const emptyWarnings = buildReport(state());
    emptyRequired.totalRequiredMemory = "";
    (nullHardware as { recommendedHardware: null }).recommendedHardware = null;
    (numericCloudCost as { cloudCost: number }).cloudCost = 1;
    (invalidAccuracy as { accuracy: "Certain" }).accuracy = "Certain";
    emptyBreakdown.breakdown = [];
    emptyAssumptions.assumptions = [];
    emptyWarnings.warnings = [];

    expect(isReportPayload(report)).toBe(true);
    expect(isReportPayload(null)).toBe(false);
    expect(isReportPayload(emptyRequired)).toBe(false);
    expect(isReportPayload(nullHardware)).toBe(false);
    expect(isReportPayload(numericCloudCost)).toBe(false);
    expect(isReportPayload(invalidAccuracy)).toBe(false);
    expect(isReportPayload(emptyBreakdown)).toBe(false);
    expect(isReportPayload(emptyAssumptions)).toBe(false);
    expect(isReportPayload(emptyWarnings)).toBe(false);
  });

  test("renders escaped report values and required sections", () => {
    const baseReport = buildReport(state());
    const baseHardware = baseReport.recommendedHardware;
    const report = {
      totalRequiredMemory: "<b>20.4 GB</b>",
      minimumRawVramNeeded: baseReport.minimumRawVramNeeded,
      speed: baseReport.speed,
      cloudCost: baseReport.cloudCost,
      accuracy: baseReport.accuracy,
      breakdown: baseReport.breakdown,
      assumptions: baseReport.assumptions,
      warnings: baseReport.warnings,
      calculation: baseReport.calculation,
      recommendedHardware: {
        requiredMemory: baseHardware.requiredMemory,
        usableVramTarget: baseHardware.usableVramTarget,
        minimumRawVram: baseHardware.minimumRawVram,
        recommendedTier: "<script>bad()</script>",
        math: baseHardware.math,
      },
    };
    const html = renderResults(report);

    expect(html).toContain("Total Required Memory");
    expect(html).toContain("Recommended Hardware");
    expect(html).toContain("Minimum Raw VRAM Needed");
    expect(html).toContain("&lt;b&gt;20.4 GB&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  });

  test("renders every adaptive input family", () => {
    expect(renderForm(state({ workload_family: "text_encoder" }))).toContain(
      "Sequence Length",
    );
    expect(renderForm(state({ workload_family: "encoder_decoder" }))).toContain(
      "Input Tokens",
    );
    expect(renderForm(state({ workload_family: "vision" }))).toContain(
      "Image Width",
    );
    expect(renderForm(state({ workload_family: "image_diffusion" }))).toContain(
      "Output Image Width",
    );
    expect(renderForm(state({ workload_family: "vision_language" }))).toContain(
      "Text Context Tokens",
    );
    expect(
      renderForm(state({ workload_family: "video_generation" })),
    ).toContain("Output Resolution");
    expect(renderForm(state({ workload_family: "audio" }))).toContain(
      "Audio Length",
    );
    expect(renderForm(state({ workload_family: "tabular" }))).toContain(
      "Rows per Batch",
    );
    expect(renderForm(state({ workload_family: "custom" }))).toContain(
      "Input Size Preset",
    );
    expect(renderForm(state({ execution_mode: "Full training" }))).toContain(
      "Training Batch Size",
    );
    expect(
      renderForm(state({ workload_family: "custom", moe_enabled: true })),
    ).toContain("Active Parameters");
    expect(renderStatusBar()).toContain("local TypeScript");
  });

  test("omits cloud cost markup for local reports", () => {
    const local = buildReport(state({ runtime_profile: "Local / Edge" }));

    expect(renderResults(local)).not.toContain("Cloud cost");
  });
});

describe("conditional controls", () => {
  test("shows MoE only for supported families and active parameters only when checked", () => {
    const root = appRoot();
    mountCalculator(root, runtime());

    const family = root.querySelector<HTMLSelectElement>(
      'select[name="workload_family"]',
    );
    const moe = root.querySelector<HTMLInputElement>(
      'input[name="moe_enabled"]',
    );
    const active = root.querySelector<HTMLInputElement>(
      'input[name="active_params"]',
    );
    expect(family).not.toBeNull();
    expect(moe).not.toBeNull();
    expect(active).not.toBeNull();

    moe?.click();
    syncConditionalControls(root);
    expect(active?.closest<HTMLElement>(".active-params")?.hidden).toBe(false);

    if (family !== null && moe !== null) {
      family.value = "vision";
      syncConditionalControls(root);
      expect(moe.closest<HTMLElement>(".moe-control")?.hidden).toBe(true);
      expect(moe.checked).toBe(false);
    }
  });

  test("updates workload-size label for training modes", () => {
    const root = appRoot();
    mountCalculator(root, runtime());
    const mode = root.querySelector<HTMLSelectElement>(
      'select[name="execution_mode"]',
    );

    expect(root.querySelector("[data-workload-label]")?.textContent).toBe(
      "Concurrent Requests",
    );
    if (mode !== null) {
      mode.value = "Full training";
      syncConditionalControls(root);
    }
    expect(root.querySelector("[data-workload-label]")?.textContent).toBe(
      "Training Batch Size",
    );
  });

  test("does nothing when conditional controls are absent", () => {
    const root = appRoot();

    syncConditionalControls(root);

    expect(root.childElementCount).toBe(0);
  });
});

describe("calculator app", () => {
  test("renders the default local TypeScript report without network access", () => {
    const fetchReport = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    const root = appRoot();
    mountCalculator(root, runtime());

    expect(root.querySelector(".total")?.textContent).toBe("19.0 GB");
    expect(root.textContent).toContain("Model Task Type");
    expect(root.textContent).toContain("Advanced assumptions");
    expect(root.textContent).not.toContain("Batch Size");
    expect(fetchReport).not.toHaveBeenCalled();
  });

  test("submits normalized form state into the URL and recomputes", () => {
    const root = appRoot();
    const rt = runtime();
    mountCalculator(root, rt);

    const totalParameters = root.querySelector<HTMLInputElement>(
      'input[name="total_params"]',
    );
    const knownFile = root.querySelector<HTMLInputElement>(
      'input[name="known_model_file_size_gb"]',
    );
    if (totalParameters !== null) {
      totalParameters.value = "8";
    }
    const precision = root.querySelector<HTMLSelectElement>(
      'select[name="precision"]',
    );
    const runtimeProfile = root.querySelector<HTMLSelectElement>(
      'select[name="runtime_profile"]',
    );
    if (precision !== null && runtimeProfile !== null) {
      precision.value = "4-bit";
      runtimeProfile.value = "Local / Edge";
    }
    if (knownFile !== null) {
      knownFile.value = "4.6";
    }
    const form = root.querySelector("form");
    if (form !== null) {
      const upload = document.createElement("input");
      upload.type = "file";
      upload.name = "ignored_upload";
      form.append(upload);
      form.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    }

    expect(rt.history.replaceState).toHaveBeenCalled();
    expect(root.querySelector(".total")?.textContent).toBe("6.3 GB");
  });

  test("handles direct change and submit events defensively", () => {
    const root = appRoot();
    const app = new CalculatorApp(root, runtime());
    app.mount();

    app.handleEvent(new Event("change"));
    app.handleEvent(new Event("submit"));
    app.handleEvent(new Event("focus"));

    expect(root.querySelector("form")).not.toBeNull();
  });

  test("rerenders adaptive fields on family and execution-mode changes", () => {
    const root = appRoot();
    mountCalculator(root, runtime());
    const family = root.querySelector<HTMLSelectElement>(
      'select[name="workload_family"]',
    );

    if (family !== null) {
      family.value = "vision";
      family.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(root.textContent).toContain("Image Width");
    const moe = root.querySelector<HTMLInputElement>(
      'input[name="moe_enabled"]',
    );
    expect(moe?.closest<HTMLElement>(".moe-control")?.hidden).toBe(true);

    const mode = root.querySelector<HTMLSelectElement>(
      'select[name="execution_mode"]',
    );
    if (mode !== null) {
      mode.value = "Full training";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(root.textContent).toContain("Training Batch Size");
  });

  test("main module mounts when an app root exists and throws without one", async () => {
    const root = document.createElement("main");
    root.id = "app";
    document.body.append(root);

    vi.resetModules();
    await import("./main");
    expect(root.querySelector("form")).not.toBeNull();
    document.body.replaceChildren();

    vi.resetModules();
    await expect(import("./main")).rejects.toThrow("Missing app root");
  });
});
