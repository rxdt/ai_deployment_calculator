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
  return { ...defaultState(), ...overrides };
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

    expect(isReportPayload(report)).toBe(true);
    expect(isReportPayload(null)).toBe(false);
    expect(isReportPayload({ ...report, totalRequiredMemory: "" })).toBe(false);
    expect(isReportPayload({ ...report, recommendedHardware: null })).toBe(
      false,
    );
    expect(isReportPayload({ ...report, cloudCost: 1 })).toBe(false);
    expect(isReportPayload({ ...report, accuracy: "Certain" })).toBe(false);
    expect(isReportPayload({ ...report, breakdown: [] })).toBe(false);
    expect(isReportPayload({ ...report, assumptions: [] })).toBe(false);
    expect(isReportPayload({ ...report, warnings: [] })).toBe(false);
  });

  test("renders escaped report values and required sections", () => {
    const report = {
      ...buildReport(state()),
      totalRequiredMemory: "<b>20.4 GB</b>",
      recommendedHardware: {
        ...buildReport(state()).recommendedHardware,
        recommendedTier: "<script>bad()</script>",
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
      "Micro Batch Size",
    );
    expect(
      renderForm(state({ workload_family: "custom", moe_enabled: true })),
    ).toContain("Active Parameters");
    expect(renderStatusBar()).toContain("source: local TypeScript");
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
      "Micro Batch Size",
    );
  });

  test("does nothing when conditional controls are absent", () => {
    const root = appRoot();

    syncConditionalControls(root);

    expect(root.childElementCount).toBe(0);
  });
});

describe("calculator app", () => {
  test("renders the default local TypeScript report", () => {
    const root = appRoot();
    mountCalculator(root, runtime());

    expect(root.querySelector(".total")?.textContent).toBe("18.2 GB");
    expect(root.textContent).toContain("Workload Family");
    expect(root.textContent).toContain("Advanced assumptions");
    expect(root.textContent).not.toContain("Batch Size");
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
    expect(root.querySelector(".total")?.textContent).toBe("6.1 GB");
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
    expect(root.textContent).toContain("Micro Batch Size");
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
