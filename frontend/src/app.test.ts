import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildReport,
  CalculatorApp,
  isReportPayload,
  mountCalculator,
  normalizedState,
  renderResults,
  searchFromState,
  type BrowserRuntime,
  type FormState,
  type ReportPayload,
} from "./app";
import { roundTo } from "./calculator";

const report: ReportPayload = {
  total_vram: "20.1 GB",
  host_ram: "32 GB host RAM",
  plan: {
    primary: "RTX 4090",
    primary_fit: "single GPU",
    optimization: "No memory optimization is needed.",
  },
  breakdown: [
    { label: "Weights", value: "16.0 GB" },
    { label: "KV cache", value: "0.8 GB" },
    { label: "Task", value: "0.0 GB" },
    { label: "CUDA/system", value: "1.5 GB" },
  ],
  hardware: [{ name: "RTX 4090", detail: "1 x 24 GB", sharding: "single GPU" }],
  comparison: [
    {
      precision: "32-bit",
      total: "37.7 GB",
      savings: "-17.6 GB",
      selected: false,
    },
    {
      precision: "16-bit",
      total: "20.1 GB",
      savings: "0.0 GB",
      selected: true,
    },
    {
      precision: "8-bit",
      total: "11.3 GB",
      savings: "8.8 GB",
      selected: false,
    },
    {
      precision: "4-bit",
      total: "6.9 GB",
      savings: "13.2 GB",
      selected: false,
    },
  ],
  assumptions: [
    { label: "Safety margin", value: "10%" },
    { label: "CUDA/system tax", value: "1.5 GB" },
    {
      label: "KV cache heuristic",
      value: "(parameters / 10) * (context / 8k)",
    },
    {
      label: "Host RAM rule",
      value: "At least 32 GB, rounded up in 16 GB increments",
    },
    {
      label: "Supported precisions",
      value: "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache",
    },
  ],
  calculation: "(16.0 + 0.8 + 0.0 + 1.5) * 1.10",
};

const denseState: FormState = {
  parameters_b: "8",
  context_tokens: "8000",
  weight_bits: "16",
  kv_cache_bits: "16",
  runtime: "pytorch",
  architecture: "dense",
  active_parameters_b: "1.3",
  trained: false,
  use_adapter: false,
};

const moeTrainingState: FormState = {
  ...denseState,
  parameters_b: "70",
  context_tokens: "16000",
  weight_bits: "4",
  kv_cache_bits: "8",
  runtime: "llama_cpp_gguf",
  architecture: "moe",
  active_parameters_b: "8",
  trained: true,
  use_adapter: true,
};

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

function expectDefaultState(state: FormState): void {
  expect(state).toEqual(denseState);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("state normalization", () => {
  test("uses defaults for empty or invalid query state", () => {
    expectDefaultState(normalizedState(new URLSearchParams()));
    expectDefaultState(
      normalizedState(
        new URLSearchParams({
          parameters_b: "0",
          context_tokens: "-1",
          weight_bits: "99",
          kv_cache_bits: "bogus",
          runtime: "tensorflow",
          architecture: "moe",
          active_parameters_b: "999",
          trained: "on",
          use_adapter: "on",
        }),
      ),
    );
    expectDefaultState(
      normalizedState(
        new URLSearchParams("parameters_b=0x10&context_tokens=8000"),
      ),
    );
    expectDefaultState(
      normalizedState(new URLSearchParams("context_tokens=8000")),
    );
  });

  test("accepts the last repeated values when they are valid", () => {
    const state = normalizedState(
      new URLSearchParams(
        "parameters_b=bad&parameters_b=70&context_tokens=16000&weight_bits=32&weight_bits=4&kv_cache_bits=8&runtime=llama_cpp_gguf&architecture=moe&active_parameters_b=8&trained=ON&use_adapter=1",
      ),
    );

    expect(state).toEqual(moeTrainingState);
  });

  test("normalizes dense state and ignores adapter use without training", () => {
    const state = normalizedState(
      new URLSearchParams({
        parameters_b: ".5",
        context_tokens: "0",
        weight_bits: "32",
        kv_cache_bits: "4",
        runtime: "pytorch",
        architecture: "dense",
        active_parameters_b: "999",
        trained: "off",
        use_adapter: "on",
      }),
    );

    expect(state).toEqual({
      ...denseState,
      parameters_b: ".5",
      context_tokens: "0",
      weight_bits: "32",
      kv_cache_bits: "4",
    });
  });

  test("rejects invalid active MoE parameters", () => {
    expectDefaultState(
      normalizedState(
        new URLSearchParams({
          parameters_b: "8",
          context_tokens: "8000",
          weight_bits: "16",
          kv_cache_bits: "16",
          runtime: "pytorch",
          architecture: "moe",
          active_parameters_b: "9",
        }),
      ),
    );
  });

  test("defaults missing active MoE parameters", () => {
    expect(
      normalizedState(
        new URLSearchParams({
          parameters_b: "8",
          context_tokens: "8000",
          weight_bits: "16",
          kv_cache_bits: "16",
          runtime: "pytorch",
          architecture: "moe",
        }),
      ),
    ).toEqual({ ...denseState, architecture: "moe" });
  });

  test("serializes dense and MoE state for report requests", () => {
    expect(searchFromState(denseState).toString()).toBe(
      "parameters_b=8&context_tokens=8000&weight_bits=16&kv_cache_bits=16&runtime=pytorch&architecture=dense",
    );
    expect(searchFromState(moeTrainingState).toString()).toBe(
      "parameters_b=70&context_tokens=16000&weight_bits=4&kv_cache_bits=8&runtime=llama_cpp_gguf&architecture=moe&active_parameters_b=8&trained=on&use_adapter=on",
    );
    expect(
      searchFromState({ ...moeTrainingState, use_adapter: false }).get(
        "use_adapter",
      ),
    ).toBeNull();
  });
});

describe("local report calculation", () => {
  test("builds the default 8B inference deployment", () => {
    const built = buildReport(denseState);

    expect(isReportPayload(built, "16")).toBe(true);
    expect(built.total_vram).toBe("20.1 GB");
    expect(built.host_ram).toBe("32 GB host RAM");
    expect(built.plan).toEqual({
      primary: "RTX 4090",
      primary_fit: "single GPU",
      optimization:
        "Lower weight precision (8-bit or 4-bit) to shrink the model weights first.",
    });
    expect(built.breakdown).toEqual([
      { label: "Weights", value: "16.0 GB" },
      { label: "KV cache", value: "0.8 GB" },
      { label: "Task", value: "0.0 GB" },
      { label: "CUDA/system", value: "1.5 GB" },
    ]);
    expect(built.comparison).toEqual([
      {
        precision: "32-bit",
        total: "37.7 GB",
        savings: "-17.6 GB",
        selected: false,
      },
      {
        precision: "16-bit",
        total: "20.1 GB",
        savings: "0.0 GB",
        selected: true,
      },
      {
        precision: "8-bit",
        total: "11.3 GB",
        savings: "8.8 GB",
        selected: false,
      },
      {
        precision: "4-bit",
        total: "6.9 GB",
        savings: "13.2 GB",
        selected: false,
      },
    ]);
    expect(built.hardware[0]).toEqual({
      name: "T4 16GB",
      detail: "2x 16 GB",
      sharding: "tensor parallel",
    });
    expect(built.calculation).toBe("(16.0 + 0.8 + 0.0 + 1.5) * 1.10 = 20.1 GB");
  });

  test("builds the MoE training deployment with the GGUF margin and active-parameter KV", () => {
    const built = buildReport(moeTrainingState);

    expect(isReportPayload(built, "4")).toBe(true);
    expect(built.total_vram).toBe("48.5 GB");
    expect(built.host_ram).toBe("64 GB host RAM");
    expect(built.plan.primary).toBe("A100 80GB");
    expect(built.breakdown[1].value).toBe("8.0 GB");
    expect(built.breakdown[2].value).toBe("4.0 GB");
    expect(built.assumptions[0].value).toBe("0%");
    expect(built.assumptions[2].value).toBe(
      "active_parameters * (context_k / 8)",
    );
    expect(built.calculation).toBe("(35.0 + 8.0 + 4.0 + 1.5) * 1.00 = 48.5 GB");
  });

  test("recommends FP8 KV cache when weights are already minimal", () => {
    const built = buildReport({ ...denseState, weight_bits: "4" });

    expect(built.plan.optimization).toBe(
      "Use an FP8 KV cache to shrink long-context memory that weight quantization can't.",
    );
  });

  test("recommends no optimization once everything fits a single small card", () => {
    const built = buildReport({
      ...denseState,
      parameters_b: "4",
      weight_bits: "4",
      kv_cache_bits: "8",
    });

    expect(built.plan.optimization).toBe(
      "No memory optimization needed; the deployment already fits a single card.",
    );
    expect(built.plan.primary_fit).toBe("single GPU");
  });

  test("flags large shards and tensor-parallel sharding for full training", () => {
    const built = buildReport({
      ...denseState,
      parameters_b: "70",
      weight_bits: "4",
      kv_cache_bits: "8",
      trained: true,
    });

    expect(built.plan.optimization).toBe(
      "Reduce the context window or move to larger-memory GPUs to avoid tensor parallelism.",
    );
    expect(built.hardware[0].sharding).toBe("large shard");
  });

  test("rounds half values to even like the historical backend", () => {
    expect(roundTo(2.5, 0)).toBe(2);
    expect(roundTo(3.5, 0)).toBe(4);
    expect(roundTo(1.24, 1)).toBe(1.2);
  });
});

describe("report contract", () => {
  test("accepts the expected report payload", () => {
    expect(isReportPayload(report, "16")).toBe(true);
  });

  test("rejects malformed top-level report fields", () => {
    expect(isReportPayload(null, "16")).toBe(false);
    expect(isReportPayload({ ...report, total_vram: " " }, "16")).toBe(false);
    expect(isReportPayload({ ...report, host_ram: "" }, "16")).toBe(false);
    expect(isReportPayload({ ...report, plan: null }, "16")).toBe(false);
    expect(
      isReportPayload(
        { ...report, plan: { ...report.plan, primary: "" } },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        { ...report, plan: { ...report.plan, primary_fit: "" } },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        { ...report, plan: { ...report.plan, optimization: "" } },
        "16",
      ),
    ).toBe(false);
    expect(isReportPayload({ ...report, calculation: "" }, "16")).toBe(false);
  });

  test("rejects malformed breakdown rows", () => {
    expect(isReportPayload({ ...report, breakdown: null }, "16")).toBe(false);
    expect(
      isReportPayload(
        { ...report, breakdown: report.breakdown.slice(0, 2) },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        { ...report, breakdown: [{ label: "Weights", value: 1 }] },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          breakdown: report.breakdown.map((row) => ({
            ...row,
            label: "Other",
          })),
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          breakdown: report.breakdown.map((row) => ({ ...row, value: "" })),
        },
        "16",
      ),
    ).toBe(false);
  });

  test("rejects malformed hardware rows", () => {
    expect(isReportPayload({ ...report, hardware: null }, "16")).toBe(false);
    expect(isReportPayload({ ...report, hardware: [] }, "16")).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          hardware: [{ name: 1, detail: "1 x 24 GB", sharding: "single GPU" }],
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          hardware: [{ name: "", detail: "1 x 24 GB", sharding: "single GPU" }],
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          hardware: [{ name: "RTX 4090", detail: "", sharding: "single GPU" }],
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          hardware: [{ name: "RTX 4090", detail: "1 x 24 GB", sharding: "" }],
        },
        "16",
      ),
    ).toBe(false);
  });

  test("rejects malformed comparison rows", () => {
    expect(isReportPayload({ ...report, comparison: null }, "16")).toBe(false);
    expect(
      isReportPayload(
        { ...report, comparison: report.comparison.slice(0, 2) },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          comparison: [
            {
              precision: 16,
              total: "20.1 GB",
              savings: "0.0 GB",
              selected: true,
            },
          ],
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          comparison: report.comparison.map((row) => ({ ...row, total: "" })),
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          comparison: report.comparison.map((row) => ({ ...row, savings: "" })),
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          comparison: report.comparison.map((row) => ({
            ...row,
            selected: "yes",
          })),
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          comparison: report.comparison.map((row) => ({
            ...row,
            selected: true,
          })),
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          comparison: report.comparison.map((row) => ({
            ...row,
            selected: row.precision === "8-bit",
          })),
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          comparison: report.comparison.map((row) => ({
            ...row,
            precision: "16-bit",
          })),
        },
        "16",
      ),
    ).toBe(false);
  });

  test("rejects malformed assumption rows", () => {
    expect(isReportPayload({ ...report, assumptions: null }, "16")).toBe(false);
    expect(isReportPayload({ ...report, assumptions: [] }, "16")).toBe(false);
    expect(
      isReportPayload(
        { ...report, assumptions: [{ label: "Safety margin", value: 10 }] },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          assumptions: report.assumptions.map((row) => ({
            ...row,
            label: "Other",
          })),
        },
        "16",
      ),
    ).toBe(false);
    expect(
      isReportPayload(
        {
          ...report,
          assumptions: report.assumptions.map((row) => ({ ...row, value: "" })),
        },
        "16",
      ),
    ).toBe(false);
  });
});

describe("rendering", () => {
  test("renders escaped inference, full training, and adapter summaries", () => {
    const hostileReport = {
      ...report,
      total_vram: "<b>20.1 GB</b>",
      plan: {
        ...report.plan,
        primary: "<script>bad()</script>",
        optimization: "<strong>safe text</strong>",
      },
    };

    expect(renderResults(hostileReport, denseState)).toContain(
      "<h2>Inference</h2>",
    );
    expect(renderResults(report, { ...denseState, trained: true })).toContain(
      "<h2>Full training</h2>",
    );
    const qlora = renderResults(hostileReport, {
      ...denseState,
      trained: true,
      use_adapter: true,
    });
    expect(qlora).toContain("<h2>QLoRA</h2>");
    expect(qlora).toContain("&lt;b&gt;20.1 GB&lt;/b&gt;");
    expect(qlora).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(qlora).not.toContain("&lt;strong&gt;safe text&lt;/strong&gt;");
    expect(qlora).not.toContain('class="optimization"');
    expect(qlora).toContain('class="selected"');
  });
});

describe("calculator app", () => {
  test("renders the default report locally and syncs controls", () => {
    const root = appRoot();
    mountCalculator(root, runtime());

    expect(root.querySelector(".total")?.textContent).toBe("20.1 GB");
    expect(
      root.querySelector<HTMLInputElement>('input[name="use_adapter"]')
        ?.disabled,
    ).toBe(true);
    expect(
      root.querySelector<HTMLInputElement>('input[name="active_parameters_b"]')
        ?.disabled,
    ).toBe(true);
  });

  test("recomputes and normalizes form state on submit", () => {
    const root = appRoot();
    const browser = runtime(
      "?parameters_b=70&context_tokens=16000&weight_bits=4&kv_cache_bits=8&runtime=llama_cpp_gguf&architecture=moe&active_parameters_b=8&trained=on&use_adapter=on",
    );
    mountCalculator(root, browser);

    expect(root.querySelector(".total")?.textContent).toBe("48.5 GB");
    expect(
      root.querySelector<HTMLInputElement>('input[name="active_parameters_b"]')
        ?.disabled,
    ).toBe(false);

    const parameters = root.querySelector<HTMLInputElement>(
      'input[name="parameters_b"]',
    );
    if (parameters) {
      parameters.value = "13";
    }
    root.querySelector<HTMLFormElement>("form")?.requestSubmit();

    expect(browser.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "?parameters_b=13&context_tokens=16000&weight_bits=4&kv_cache_bits=8&runtime=llama_cpp_gguf&architecture=moe&active_parameters_b=8&trained=on&use_adapter=on",
    );
    expect(root.querySelector(".total")?.textContent).toBe("20.0 GB");
  });

  test("disables adapter and active-parameter controls from change events", () => {
    const root = appRoot();
    mountCalculator(root, runtime());

    const trained = root.querySelector<HTMLInputElement>(
      'input[name="trained"]',
    );
    const adapter = root.querySelector<HTMLInputElement>(
      'input[name="use_adapter"]',
    );
    const architecture = root.querySelector<HTMLSelectElement>(
      'select[name="architecture"]',
    );
    const activeParameters = root.querySelector<HTMLInputElement>(
      'input[name="active_parameters_b"]',
    );

    expect(architecture?.selectedOptions[0]?.textContent).toBe(
      "Dense (Typical inference)",
    );

    trained?.click();
    adapter?.click();
    trained?.click();
    expect(adapter?.checked).toBe(false);
    expect(adapter?.disabled).toBe(true);

    if (architecture) {
      architecture.value = "moe";
      architecture.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expect(activeParameters?.disabled).toBe(false);
  });

  test("handles missing dynamic controls and non-string submitted form values", () => {
    const root = appRoot();
    const browser = runtime();
    const calculator = new CalculatorApp(root, browser);
    root.innerHTML =
      '<input name="trained" type="checkbox"><select name="architecture"><option value="dense">Dense</option></select>';
    root.addEventListener("change", calculator);

    root
      .querySelector<HTMLInputElement>('input[name="trained"]')
      ?.dispatchEvent(new Event("change", { bubbles: true }));
    root
      .querySelector<HTMLSelectElement>('select[name="architecture"]')
      ?.dispatchEvent(new Event("change", { bubbles: true }));

    root.innerHTML =
      '<form><input name="parameters_b" value="8"><input name="context_tokens" value="8000"><input name="attachment" type="file"></form>';
    root.addEventListener("submit", calculator);
    root.querySelector<HTMLFormElement>("form")?.requestSubmit();

    expect(browser.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "?parameters_b=8&context_tokens=8000&weight_bits=16&kv_cache_bits=16&runtime=pytorch&architecture=dense",
    );
    calculator.handleEvent(new Event("noop"));
    root.dispatchEvent(new Event("change", { bubbles: true })); // change on a non-control target is ignored
    calculator.handleEvent(new Event("submit")); // submit without a form target is ignored
  });
});

describe("main bootstrap", () => {
  test("throws without an app root", async () => {
    vi.resetModules();
    await expect(import("./main")).rejects.toThrow("Missing app root");
  });

  test("mounts the calculator when the app root exists", async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';

    await import("./main");

    expect(document.querySelector(".total")?.textContent).toBe("20.1 GB");
  });
});
