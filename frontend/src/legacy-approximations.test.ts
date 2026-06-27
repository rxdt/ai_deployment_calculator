import { describe, expect, test } from "vitest";
import { buildReport } from "./report";
import { defaultState, normalizedState } from "./state";

describe("legacy backend approximations are not used", () => {
  test("local buildReport replaces the removed /api/report endpoint", () => {
    const report = buildReport({ ...defaultState(), total_params: "8" });

    expect(report.totalRequiredMemory).toBe("20.4 GB");
    expect(report.calculation).not.toContain("Active_P / 10");
    expect(report.breakdown.map((row) => row.label)).not.toContain(
      "Task overhead",
    );
  });

  test("legacy trained/use_adapter query flags do not select training mode", () => {
    const state = normalizedState(
      new URLSearchParams("trained=on&use_adapter=on"),
    );

    expect(state.execution_mode).toBe("Inference");
    expect(buildReport(state).totalRequiredMemory).toBe("18.2 GB");
  });
});
