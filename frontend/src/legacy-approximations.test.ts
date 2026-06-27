// Best-effort approximations of the five backend tests that had no direct TS port.
// Each test documents the original Python expectation and asserts the closest behavior
// the Vite app actually exposes. Two cover an intentional scope reduction (flat QLoRA
// overhead, no trainable-% control); three approximate obsolete server/no-JS/source tests.

import { describe, expect, test } from "vitest";
import { taskOverheadGb, totalVramGb } from "./calculator";
import { buildReport, specFromState } from "./report";
import { normalizedState, searchFromState } from "./state";
import { renderForm, renderResults } from "./render";
import { isReportPayload } from "./validation";
import type { FormState } from "./types";

const dense: FormState = {
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

/**
 
@param overrides
 */
function st(overrides: Partial<FormState>): FormState {
  return { ...dense, ...overrides };
}

// Approximates test_task_overhead_lora_scales_with_trainable_parameters.
// Python scaled the adapter/optimizer overhead by trainable_parameters_percent: at 2% an
// 8B/16-bit/8k QLoRA run was 1.408 GB overhead -> 21.7 GB total. The TS port intentionally
// replaced that with a flat 4.0 GB overhead (documented scope reduction), so the overhead no
// longer varies with model size and the same deployment totals 24.5 GB instead.
describe("QLoRA task overhead (flat replacement for trainable-% scaling)", () => {
  test("is a fixed 4.0 GB independent of model size", () => {
    expect(
      taskOverheadGb(specFromState(st({ trained: true, use_adapter: true }))),
    ).toBeCloseTo(4);
    expect(
      taskOverheadGb(
        specFromState(
          st({ parameters_b: "70", trained: true, use_adapter: true }),
        ),
      ),
    ).toBeCloseTo(4);
  });

  test("totals the flat-overhead deployment instead of the old 2%-scaled 21.7 GB", () => {
    expect(
      totalVramGb(specFromState(st({ trained: true, use_adapter: true }))),
    ).toBeCloseTo(24.5);
  });
});

// Approximates test_invalid_trainable_parameters_percent_rejected.
// Python rejected trainable_parameters_percent <= 0 or > 100. The TS form exposes no such
// control, so the closest faithful behavior is that the parameter is inert: an out-of-range
// value is neither honored nor a reason to reset, and it never enters the form state or URL.
describe("trainable_parameters_percent has no control to reject", () => {
  test("an out-of-range value is ignored rather than resetting the deployment", () => {
    const state = normalizedState(
      new URLSearchParams(
        "parameters_b=8&context_tokens=8000&trained=on&use_adapter=on&trainable_parameters_percent=101",
      ),
    );
    expect(state).toEqual(st({ trained: true, use_adapter: true }));
    expect("trainable_parameters_percent" in state).toBe(false);
    expect(searchFromState(state).has("trainable_parameters_percent")).toBe(
      false,
    );
  });
});

// Approximates test_report_endpoint_returns_payload from test_server.py. The FastAPI
// /api/report endpoint is gone; the static app computes the same payload locally. This pins
// the 70B/4-bit/8k/8-bit-KV QLoRA deployment the server test asserted (48.4 GB total).
describe("local report stands in for the removed /api/report endpoint", () => {
  test("computes the server test's payload from the submitted query", () => {
    const state = normalizedState(
      new URLSearchParams(
        "parameters_b=70&context_tokens=8000&weight_bits=4&kv_cache_bits=8&trained=on&use_adapter=on",
      ),
    );
    const report = buildReport(state);
    expect(report.total_vram).toBe("48.4 GB");
    expect(report.host_ram).toBe("64 GB host RAM");
    expect(report.plan.primary).toBe("A100 80GB");
    expect(report.plan.primary_fit).toBe("single GPU");
    expect(report.breakdown[0]).toEqual({ label: "Weights", value: "35.0 GB" });
    expect(report.comparison[3].selected).toBe(true);
  });
});

// Approximates test_page.py selection/escaping checks from web.page. The no-JS server page is
// gone; renderForm/renderResults produce the equivalent client-rendered markup, so the same
// control-selection and HTML-escaping behaviors are asserted against the live renderers.
describe("client renderers stand in for the removed no-JS page", () => {
  test("renderForm selects the submitted quantization, training, and MoE controls", () => {
    const html = renderForm(
      st({
        parameters_b: "70",
        weight_bits: "4",
        kv_cache_bits: "8",
        architecture: "moe",
        trained: true,
        use_adapter: true,
      }),
    );
    expect(html).toContain('<option value="4" selected>4-bit</option>');
    expect(html).toContain('<option value="8" selected>8-bit</option>');
    expect(html).toContain('name="trained" type="checkbox" checked');
    expect(html).toContain('name="use_adapter" type="checkbox" checked');
    expect(html).toContain('<option value="moe" selected>MoE</option>');
  });

  test("renderResults labels the task and escapes hostile report values", () => {
    const report = buildReport(st({ trained: true, use_adapter: true }));
    const hostile = {
      ...report,
      plan: { ...report.plan, primary: "<script>bad()</script>" },
    };
    const html = renderResults(
      hostile,
      st({ trained: true, use_adapter: true }),
    );
    expect(html).toContain("<h2>QLoRA</h2>");
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).not.toContain("<script>bad()</script>");
  });
});

// Approximates test_frontend.py, which grepped the source to prove the app fetched a backend
// contract. The app now computes locally, so the behavioral equivalent is that buildReport is
// a pure, synchronous local computation whose payload satisfies the frontend contract with no
// network call, and renderForm still exposes every required control.
describe("frontend computes the report locally with no backend", () => {
  test("buildReport returns a contract-valid payload synchronously", () => {
    const report = buildReport(dense);
    expect(report).not.toBeInstanceOf(Promise);
    expect(isReportPayload(report, "16")).toBe(true);
  });

  test("renderForm exposes every required control", () => {
    const html = renderForm(dense);
    for (const name of [
      "parameters_b",
      "context_tokens",
      "weight_bits",
      "kv_cache_bits",
      "runtime",
      "architecture",
      "active_parameters_b",
      "trained",
      "use_adapter",
    ]) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).toContain('min="0.000001" step="any"');
  });
});
