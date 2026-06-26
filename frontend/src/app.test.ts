import { afterEach, describe, expect, test, vi } from "vitest";
import {
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
    { precision: "32-bit", total: "37.7 GB", savings: "-17.6 GB", selected: false },
    { precision: "16-bit", total: "20.1 GB", savings: "0.0 GB", selected: true },
    { precision: "8-bit", total: "11.3 GB", savings: "8.8 GB", selected: false },
    { precision: "4-bit", total: "6.9 GB", savings: "13.2 GB", selected: false },
  ],
  assumptions: [
    { label: "Safety margin", value: "10%" },
    { label: "CUDA/system tax", value: "1.5 GB" },
    { label: "KV cache heuristic", value: "(parameters / 10) * (context / 8k)" },
    { label: "Host RAM rule", value: "At least 32 GB, rounded up in 16 GB increments" },
    { label: "Supported precisions", value: "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache" },
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

const fourBitReport: ReportPayload = {
  ...report,
  comparison: report.comparison.map((row) => ({ ...row, selected: row.precision === "4-bit" })),
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function appRoot(): HTMLDivElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}

function runtime(fetchMock: BrowserRuntime["fetch"], search = ""): BrowserRuntime {
  return {
    fetch: fetchMock,
    history: { replaceState: vi.fn() },
    location: { search },
  };
}

function expectDefaultState(state: FormState): void {
  expect(state).toEqual(denseState);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    expectDefaultState(normalizedState(new URLSearchParams("parameters_b=0x10&context_tokens=8000")));
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
    expect(searchFromState({ ...moeTrainingState, use_adapter: false }).get("use_adapter")).toBeNull();
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
    expect(isReportPayload({ ...report, plan: { ...report.plan, primary: "" } }, "16")).toBe(false);
    expect(isReportPayload({ ...report, plan: { ...report.plan, primary_fit: "" } }, "16")).toBe(false);
    expect(isReportPayload({ ...report, plan: { ...report.plan, optimization: "" } }, "16")).toBe(false);
    expect(isReportPayload({ ...report, calculation: "" }, "16")).toBe(false);
  });

  test("rejects malformed breakdown rows", () => {
    expect(isReportPayload({ ...report, breakdown: null }, "16")).toBe(false);
    expect(isReportPayload({ ...report, breakdown: report.breakdown.slice(0, 2) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, breakdown: [{ label: "Weights", value: 1 }] }, "16")).toBe(false);
    expect(isReportPayload({ ...report, breakdown: report.breakdown.map((row) => ({ ...row, label: "Other" })) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, breakdown: report.breakdown.map((row) => ({ ...row, value: "" })) }, "16")).toBe(false);
  });

  test("rejects malformed hardware rows", () => {
    expect(isReportPayload({ ...report, hardware: null }, "16")).toBe(false);
    expect(isReportPayload({ ...report, hardware: [] }, "16")).toBe(false);
    expect(isReportPayload({ ...report, hardware: [{ name: 1, detail: "1 x 24 GB", sharding: "single GPU" }] }, "16")).toBe(false);
    expect(isReportPayload({ ...report, hardware: [{ name: "", detail: "1 x 24 GB", sharding: "single GPU" }] }, "16")).toBe(false);
    expect(isReportPayload({ ...report, hardware: [{ name: "RTX 4090", detail: "", sharding: "single GPU" }] }, "16")).toBe(false);
    expect(isReportPayload({ ...report, hardware: [{ name: "RTX 4090", detail: "1 x 24 GB", sharding: "" }] }, "16")).toBe(false);
  });

  test("rejects malformed comparison rows", () => {
    expect(isReportPayload({ ...report, comparison: null }, "16")).toBe(false);
    expect(isReportPayload({ ...report, comparison: report.comparison.slice(0, 2) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, comparison: [{ precision: 16, total: "20.1 GB", savings: "0.0 GB", selected: true }] }, "16")).toBe(false);
    expect(isReportPayload({ ...report, comparison: report.comparison.map((row) => ({ ...row, total: "" })) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, comparison: report.comparison.map((row) => ({ ...row, savings: "" })) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, comparison: report.comparison.map((row) => ({ ...row, selected: "yes" })) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, comparison: report.comparison.map((row) => ({ ...row, selected: true })) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, comparison: report.comparison.map((row) => ({ ...row, selected: row.precision === "8-bit" })) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, comparison: report.comparison.map((row) => ({ ...row, precision: "16-bit" })) }, "16")).toBe(false);
  });

  test("rejects malformed assumption rows", () => {
    expect(isReportPayload({ ...report, assumptions: null }, "16")).toBe(false);
    expect(isReportPayload({ ...report, assumptions: [] }, "16")).toBe(false);
    expect(isReportPayload({ ...report, assumptions: [{ label: "Safety margin", value: 10 }] }, "16")).toBe(false);
    expect(isReportPayload({ ...report, assumptions: report.assumptions.map((row) => ({ ...row, label: "Other" })) }, "16")).toBe(false);
    expect(isReportPayload({ ...report, assumptions: report.assumptions.map((row) => ({ ...row, value: "" })) }, "16")).toBe(false);
  });
});

describe("rendering", () => {
  test("renders escaped inference, full training, and adapter summaries", () => {
    const hostileReport = {
      ...report,
      total_vram: "<b>20.1 GB</b>",
      plan: { ...report.plan, primary: "<script>bad()</script>", optimization: "<strong>safe text</strong>" },
    };

    expect(renderResults(hostileReport, denseState)).toContain("<h2>Inference</h2>");
    expect(renderResults(report, { ...denseState, trained: true })).toContain("<h2>Full training</h2>");
    const qlora = renderResults(hostileReport, { ...denseState, trained: true, use_adapter: true });
    expect(qlora).toContain("<h2>QLoRA</h2>");
    expect(qlora).toContain("&lt;b&gt;20.1 GB&lt;/b&gt;");
    expect(qlora).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(qlora).not.toContain("&lt;strong&gt;safe text&lt;/strong&gt;");
    expect(qlora).not.toContain('class="optimization"');
    expect(qlora).toContain('class="selected"');
  });
});

describe("calculator app", () => {
  test("loads a report, syncs controls, and submits normalized form state", async () => {
    const root = appRoot();
    const fetchMock = vi.fn<BrowserRuntime["fetch"]>().mockResolvedValue(response(fourBitReport));
    const browser = runtime(fetchMock, "?parameters_b=70&context_tokens=16000&weight_bits=4&kv_cache_bits=8&runtime=llama_cpp_gguf&architecture=moe&active_parameters_b=8&trained=on&use_adapter=on");
    const calculator = mountCalculator(root, browser);

    await vi.waitFor(() => expect(root.querySelector(".total")?.textContent).toBe("20.1 GB"));
    expect(root.querySelector<HTMLInputElement>('input[name="use_adapter"]')?.disabled).toBe(false);
    expect(root.querySelector<HTMLInputElement>('input[name="active_parameters_b"]')?.disabled).toBe(false);

    const parameters = root.querySelector<HTMLInputElement>('input[name="parameters_b"]');
    if (parameters) {
      parameters.value = "13";
    }
    root.querySelector<HTMLInputElement>('input[name="trained"]')?.click();
    root.querySelector<HTMLFormElement>("form")?.requestSubmit();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(browser.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "?parameters_b=13&context_tokens=16000&weight_bits=4&kv_cache_bits=8&runtime=llama_cpp_gguf&architecture=moe&active_parameters_b=8",
    );
    calculator.handleEvent(new Event("noop"));
  });

  test("disables adapter and active-parameter controls from change events", async () => {
    const root = appRoot();
    const fetchMock = vi.fn<BrowserRuntime["fetch"]>().mockResolvedValue(response(report));
    mountCalculator(root, runtime(fetchMock));

    await vi.waitFor(() => expect(root.querySelector("form")).not.toBeNull());
    const trained = root.querySelector<HTMLInputElement>('input[name="trained"]');
    const adapter = root.querySelector<HTMLInputElement>('input[name="use_adapter"]');
    const architecture = root.querySelector<HTMLSelectElement>('select[name="architecture"]');
    const activeParameters = root.querySelector<HTMLInputElement>('input[name="active_parameters_b"]');

    expect(architecture?.selectedOptions[0]?.textContent).toBe("Dense (Typical inference)");

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

  test("keeps the form visible for failed and malformed report responses", async () => {
    const failedRoot = appRoot();
    const failedApp = new CalculatorApp(
      failedRoot,
      runtime(vi.fn<BrowserRuntime["fetch"]>().mockResolvedValue(response({ error: "unavailable" }, 503))),
    );
    await failedApp.loadReport(new URLSearchParams());

    expect(failedRoot.querySelector('[role="alert"]')?.textContent).toContain("Report unavailable");
    expect(failedRoot.querySelector("form")).not.toBeNull();

    const malformedRoot = appRoot();
    const malformedApp = new CalculatorApp(
      malformedRoot,
      runtime(vi.fn<BrowserRuntime["fetch"]>().mockResolvedValue(response({ ...report, total_vram: "" }))),
    );
    await malformedApp.loadReport(new URLSearchParams());

    expect(malformedRoot.querySelector('[role="alert"]')?.textContent).toContain("Report unavailable");
    expect(malformedRoot.querySelector(".total")).toBeNull();
  });

  test("ignores stale successful and failed report responses", async () => {
    let releaseStaleSuccess: ((value: Response) => void) | undefined;
    let rejectStaleFailure: ((reason?: unknown) => void) | undefined;
    const successRoot = appRoot();
    const successFetch = vi
      .fn<BrowserRuntime["fetch"]>()
      .mockReturnValueOnce(new Promise<Response>((resolve) => {
        releaseStaleSuccess = resolve;
      }))
      .mockResolvedValue(response({ ...report, total_vram: "13.0 GB" }));
    const successApp = new CalculatorApp(successRoot, runtime(successFetch));
    const staleSuccess = successApp.loadReport(new URLSearchParams("parameters_b=70&context_tokens=8000"));
    await successApp.loadReport(new URLSearchParams("parameters_b=13&context_tokens=8000"));
    releaseStaleSuccess?.(response({ ...report, total_vram: "70.0 GB" }));
    await staleSuccess;

    expect(successRoot.querySelector(".total")?.textContent).toBe("13.0 GB");

    const failureRoot = appRoot();
    const failureFetch = vi
      .fn<BrowserRuntime["fetch"]>()
      .mockReturnValueOnce(new Promise<Response>((_resolve, reject) => {
        rejectStaleFailure = reject;
      }))
      .mockResolvedValue(response(report));
    const failureApp = new CalculatorApp(failureRoot, runtime(failureFetch));
    const staleFailure = failureApp.loadReport(new URLSearchParams("parameters_b=70&context_tokens=8000"));
    await failureApp.loadReport(new URLSearchParams("parameters_b=8&context_tokens=8000"));
    rejectStaleFailure?.(new Error("late failure"));
    await staleFailure;

    expect(failureRoot.querySelector('[role="alert"]')).toBeNull();
    expect(failureRoot.querySelector(".total")?.textContent).toBe("20.1 GB");
  });

  test("handles missing dynamic controls and non-string submitted form values", async () => {
    const root = appRoot();
    const fetchMock = vi.fn<BrowserRuntime["fetch"]>().mockResolvedValue(response(report));
    const browser = runtime(fetchMock);
    const calculator = new CalculatorApp(root, browser);
    root.innerHTML = '<input name="trained" type="checkbox"><select name="architecture"><option value="dense">Dense</option></select>';
    root.addEventListener("change", calculator);

    root.querySelector<HTMLInputElement>('input[name="trained"]')?.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLSelectElement>('select[name="architecture"]')?.dispatchEvent(new Event("change", { bubbles: true }));

    root.innerHTML = '<form><input name="parameters_b" value="8"><input name="context_tokens" value="8000"><input name="attachment" type="file"></form>';
    root.addEventListener("submit", calculator);
    root.querySelector<HTMLFormElement>("form")?.requestSubmit();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(browser.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "?parameters_b=8&context_tokens=8000&weight_bits=16&kv_cache_bits=16&runtime=pytorch&architecture=dense",
    );
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
    vi.stubGlobal("fetch", vi.fn<BrowserRuntime["fetch"]>().mockResolvedValue(response(report)));

    await import("./main");

    await vi.waitFor(() => expect(document.querySelector(".total")?.textContent).toBe("20.1 GB"));
  });
});
