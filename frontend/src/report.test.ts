// Ports the report-assembly backend tests end-to-end through buildReport(state):
//   tests/test_quantization_comparison.py  -> comparison rows + savings
//   tests/test_assumptions.py              -> assumption rows (dense vs MoE heuristic, GGUF margin)
//   tests/test_report.py / test_view.py    -> payload shape, formatted strings, calculation text
//   tests/test_presenter.py (spec mapping) -> task mapping + spec_from_form/spec_from_state
//   tests/test_api.py                      -> payload key/row/count contract
// The form_from_query normalization cases (the rest of test_presenter.py) map to
// state.ts/validation.ts and are ported in app.test.ts to avoid duplication.

import { describe, expect, test } from "vitest";
import { buildReport, specFromState } from "./report";
import { GPU_CATALOG } from "./hardware";
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

/**
 
@param text
 */
function parseGb(text: string): number {
  return Number(text.replace(" GB", ""));
}

describe("quantization comparison rows", () => {
  test("match the worked 8B example", () => {
    expect(buildReport(dense).comparison).toEqual([
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
  });

  test("totals decrease as precision drops and the baseline saves nothing", () => {
    const rows = buildReport(
      st({ parameters_b: "70", trained: true, use_adapter: true }),
    ).comparison;
    const totals = rows.map((row) => parseGb(row.total));
    expect(totals[0]).toBeGreaterThan(totals[1]);
    expect(totals[1]).toBeGreaterThan(totals[2]);
    expect(totals[2]).toBeGreaterThan(totals[3]);
    expect(rows[1].savings).toBe("0.0 GB");
  });

  test("flag only the submitted weight precision", () => {
    const rows = buildReport(st({ weight_bits: "4" })).comparison;
    expect(
      rows.filter((row) => row.selected).map((row) => row.precision),
    ).toEqual(["4-bit"]);
  });

  test("preserve the GGUF runtime margin on every row", () => {
    const rows = buildReport(
      st({
        parameters_b: "104",
        context_tokens: "32000",
        weight_bits: "4",
        kv_cache_bits: "32",
        runtime: "llama_cpp_gguf",
      }),
    ).comparison;
    expect(rows.map((row) => row.total)).toEqual([
      "500.7 GB",
      "292.7 GB",
      "188.7 GB",
      "136.7 GB",
    ]);
    expect(rows.filter((row) => row.selected).map((row) => row.total)).toEqual([
      "136.7 GB",
    ]);
  });

  test("hold KV precision, context, and task fixed while varying weight precision", () => {
    const baseline = st({
      context_tokens: "16000",
      kv_cache_bits: "8",
      trained: true,
      use_adapter: true,
    });
    const noContext = st({
      context_tokens: "0",
      kv_cache_bits: "8",
      trained: true,
      use_adapter: true,
    });
    const baseRows = buildReport(baseline).comparison;
    const noContextRows = buildReport(noContext).comparison;
    const deltas = baseRows.map((row, index) =>
      Number(
        (
          parseGb(row.total) - parseGb(noContextRows.at(index)?.total ?? "")
        ).toFixed(1),
      ),
    );
    expect(deltas).toEqual([0.9, 0.8, 0.8, 0.8]);
  });
});

describe("assumption rows", () => {
  test("expose the exact dense labels and values", () => {
    expect(buildReport(dense).assumptions).toEqual([
      { label: "Safety margin", value: "10%" },
      { label: "CUDA/system tax", value: "1.5 GB" },
      {
        label: "KV cache heuristic",
        value: "(parameters / 10) * (context_k / 8)",
      },
      {
        label: "Host RAM rule",
        value: "at least 32 GB, rounded up in 16 GB increments",
      },
      {
        label: "Supported precisions",
        value: "32-bit, 16-bit, 8-bit, and 4-bit weights and KV cache",
      },
    ]);
  });

  test("reflect the MoE KV heuristic", () => {
    const rows = buildReport(
      st({
        parameters_b: "47",
        architecture: "moe",
        active_parameters_b: "1.3",
      }),
    ).assumptions;
    expect(rows.find((row) => row.label === "KV cache heuristic")?.value).toBe(
      "active_parameters * (context_k / 8)",
    );
  });

  test("reflect the GGUF runtime margin", () => {
    const rows = buildReport(
      st({
        parameters_b: "104",
        context_tokens: "32000",
        weight_bits: "4",
        runtime: "llama_cpp_gguf",
      }),
    ).assumptions;
    expect(rows.find((row) => row.label === "Safety margin")?.value).toBe("0%");
  });
});

describe("report breakdown and totals", () => {
  test("match the worked 8B check", () => {
    const report = buildReport(dense);
    expect(report.breakdown).toEqual([
      { label: "Weights", value: "16.0 GB" },
      { label: "KV cache", value: "0.8 GB" },
      { label: "Task", value: "0.0 GB" },
      { label: "CUDA/system", value: "1.5 GB" },
    ]);
    expect(report.total_vram).toBe("20.1 GB");
    expect(report.host_ram).toBe("32 GB host RAM");
  });

  test("reuse the core for total, host RAM, and primary card", () => {
    const report = buildReport(
      st({
        parameters_b: "70",
        weight_bits: "4",
        trained: true,
        use_adapter: true,
      }),
    );
    expect(report.total_vram).toBe("52.3 GB");
    expect(report.host_ram).toBe("64 GB host RAM");
    expect(report.plan.primary).toBe("A100 80GB");
    expect(report.hardware.length).toBeGreaterThan(0);
  });

  test("expose the precision comparison flagging the selected row", () => {
    const rows = buildReport(dense).comparison;
    expect(rows.map((row) => [row.precision, row.total])).toEqual([
      ["32-bit", "37.7 GB"],
      ["16-bit", "20.1 GB"],
      ["8-bit", "11.3 GB"],
      ["4-bit", "6.9 GB"],
    ]);
  });
});

describe("view formatting", () => {
  test("formats the total, plan, hardware rows, and calculation to one decimal", () => {
    const report = buildReport(dense);
    expect(report.plan).toEqual({
      primary: "RTX 4090",
      primary_fit: "single GPU",
      optimization:
        "Lower weight precision (8-bit or 4-bit) to shrink the model weights first.",
    });
    expect(report.hardware[0]).toEqual({
      name: "T4 16GB",
      detail: "2x 16 GB",
      sharding: "tensor parallel",
    });
    expect(report.hardware[1]).toEqual({
      name: "RTX 4090",
      detail: "1x 24 GB",
      sharding: "single GPU",
    });
    expect(report.hardware[2]).toEqual({
      name: "L4 24GB",
      detail: "1x 24 GB",
      sharding: "single GPU",
    });
    expect(report.calculation).toBe(
      "(16.0 + 0.8 + 0.0 + 1.5) * 1.10 = 20.1 GB",
    );
  });

  test("renders the GGUF runtime margin in the calculation", () => {
    const report = buildReport(
      st({
        parameters_b: "104",
        context_tokens: "32000",
        weight_bits: "4",
        kv_cache_bits: "32",
        runtime: "llama_cpp_gguf",
      }),
    );
    expect(report.calculation).toBe(
      "(52.0 + 83.2 + 0.0 + 1.5) * 1.00 = 136.7 GB",
    );
  });

  test("keeps a tiny deployment's calculation margin at the real 1.10", () => {
    const report = buildReport(
      st({
        parameters_b: "0.0004",
        weight_bits: "8",
        kv_cache_bits: "8",
        trained: true,
      }),
    );
    expect(report.calculation).toBe("(0.0 + 0.0 + 0.0 + 1.5) * 1.10 = 1.7 GB");
    expect(report.assumptions).toContainEqual({
      label: "Safety margin",
      value: "10%",
    });
  });
});

describe("spec mapping from form state", () => {
  test("an adapter without training stays inference", () => {
    expect(specFromState(st({ trained: false, use_adapter: true })).task).toBe(
      "inference",
    );
  });

  test("training with an adapter is QLoRA", () => {
    expect(specFromState(st({ trained: true, use_adapter: true })).task).toBe(
      "qlora",
    );
  });

  test("training without an adapter is full training", () => {
    expect(specFromState(st({ trained: true, use_adapter: false })).task).toBe(
      "full_training",
    );
  });

  test("carries controls and the mapped task", () => {
    const spec = specFromState(
      st({
        parameters_b: "70",
        weight_bits: "4",
        kv_cache_bits: "8",
        architecture: "moe",
        active_parameters_b: "8",
        trained: true,
        use_adapter: true,
      }),
    );
    expect(spec).toEqual({
      parameters_b: 70,
      context_tokens: 8000,
      weight_bits: 4,
      kv_cache_bits: 8,
      task: "qlora",
      architecture: "moe",
      active_parameters_b: 8,
      runtime: "pytorch",
    });
  });

  test("matches the core report pipeline", () => {
    expect(buildReport(dense).total_vram).toBe("20.1 GB");
  });

  test("preserves the GGUF runtime", () => {
    expect(
      specFromState(
        st({
          parameters_b: "104",
          context_tokens: "32000",
          weight_bits: "4",
          runtime: "llama_cpp_gguf",
        }),
      ).runtime,
    ).toBe("llama_cpp_gguf");
  });

  test("a form without MoE selected is dense with no active parameters", () => {
    const spec = specFromState(st({ parameters_b: "47" }));
    expect(spec.architecture).toBe("dense");
    expect(spec.active_parameters_b).toBeNull();
  });
});

describe("payload contract the frontend consumes", () => {
  test("exposes exactly the top-level and plan keys", () => {
    const report = buildReport(dense);
    expect(Object.keys(report).sort()).toEqual(
      [
        "assumptions",
        "breakdown",
        "calculation",
        "comparison",
        "hardware",
        "host_ram",
        "plan",
        "total_vram",
      ].sort(),
    );
    expect(Object.keys(report.plan).sort()).toEqual(
      ["optimization", "primary", "primary_fit"].sort(),
    );
  });

  test("each row carries exactly its frontend keys", () => {
    const report = buildReport(dense);
    expect(
      report.breakdown.every((row) => sortedKeys(row) === "label,value"),
    ).toBe(true);
    expect(
      report.assumptions.every((row) => sortedKeys(row) === "label,value"),
    ).toBe(true);
    expect(
      report.hardware.every(
        (row) => sortedKeys(row) === "detail,name,sharding",
      ),
    ).toBe(true);
    expect(
      report.comparison.every(
        (row) => sortedKeys(row) === "precision,savings,selected,total",
      ),
    ).toBe(true);
  });

  test("row counts track their sources with exactly one selected precision", () => {
    const report = buildReport(dense);
    expect(report.hardware).toHaveLength(GPU_CATALOG.length);
    expect(report.comparison).toHaveLength(4);
    expect(report.comparison.filter((row) => row.selected)).toHaveLength(1);
  });

  test("display fields are strings and selected is boolean", () => {
    const report = buildReport(st({ weight_bits: "4" }));
    for (const value of [
      report.total_vram,
      report.host_ram,
      report.calculation,
      ...Object.values(report.plan),
    ]) {
      expect(typeof value).toBe("string");
    }
    for (const row of [...report.breakdown, ...report.assumptions]) {
      expect(typeof row.value).toBe("string");
    }
    for (const row of report.comparison) {
      expect(typeof row.total).toBe("string");
      expect(typeof row.savings).toBe("string");
      expect(typeof row.selected).toBe("boolean");
    }
    expect(report.comparison.find((row) => row.selected)?.precision).toBe(
      "4-bit",
    );
  });

  test("breakdown labels match the frontend contract order", () => {
    expect(buildReport(dense).breakdown.map((row) => row.label)).toEqual([
      "Weights",
      "KV cache",
      "Task",
      "CUDA/system",
    ]);
  });

  test("assumption labels match the frontend contract", () => {
    expect(
      new Set(buildReport(dense).assumptions.map((row) => row.label)),
    ).toEqual(
      new Set([
        "Safety margin",
        "CUDA/system tax",
        "KV cache heuristic",
        "Host RAM rule",
        "Supported precisions",
      ]),
    );
  });
});

/**
 
@param row
 */
function sortedKeys(row: object): string {
  return Object.keys(row).sort().join(",");
}

describe("specFromState rejects values outside the validated domain", () => {
  test("throws on an unsupported bit width", () => {
    expect(() => specFromState(st({ weight_bits: "7" }))).toThrow(
      "unsupported bit width",
    );
  });

  test("throws on an unsupported runtime", () => {
    expect(() => specFromState(st({ runtime: "tensorflow" }))).toThrow(
      "unsupported runtime",
    );
  });
});
