# Quantization Comparison Spec

PRIORITY 3 (implemented)

## Vision

Show an AI engineer, at a glance, how much VRAM the same deployment needs at each
supported weight precision, so the "lower the precision" optimization note comes
with the concrete savings behind it instead of a bare suggestion.

## Current State

The pure comparison layer evaluates 32-bit, 16-bit, 8-bit, and 4-bit weight
precision for one `DeploymentSpec`, with savings measured against 16-bit and the
input precision flagged as selected. `DeploymentReport` exposes the comparison,
and the web UI renders a compact precision comparison.

## The math (reuses the existing equation; no new constants)

For a fixed `DeploymentSpec`, re-evaluate `total_vram_gb` while substituting each
supported `weight_bits` value (32, 16, 8, 4) and holding every other input constant.
Savings are measured against the 16-bit row:

- `total_gb` = `total_vram_gb(spec with that weight_bits)`.
- `savings_gb` = `total_gb(16-bit) - total_gb(this row)`, rounded to 1 decimal; the
  16-bit row's savings is therefore 0.0.

Worked check (8B / 8k / inference, KV 16-bit):

- 32-bit -> W=32, subtotal 34.3, total 37.7, savings -17.6
- 16-bit -> 20.1 GB, savings 0.0
- 8-bit  -> W=8, subtotal 10.3, total 11.3, savings 8.8
- 4-bit  -> W=4, subtotal 6.3, total 6.9, savings 13.2

## Prioritize These Items

- Add a pure `src/` comparison layer with typed dataclasses only; reuse
  `DeploymentSpec` and `total_vram_gb`. Do NOT add a second Pydantic model.
- Input is `DeploymentSpec`; output is a typed comparison of the supported
  weight precisions, each with its total VRAM and savings versus 16-bit.
- Flag the row whose `weight_bits` matches the input spec as the selected row.
- Hold KV-cache precision, context, and task fixed; vary only weight precision.

## If The Items Above Are Complete, Do These

- PRIORITY 2: render a compact precision comparison in the one-page web output
  (still no scroll).
- PRIORITY 3: add README examples for the comparison API and web output.

## Acceptance Signals

- `uv run ralph verify` green; 100% coverage remains.
- For 8B / 8k / inference the comparison yields 32-bit=37.7, 16-bit=20.1,
  8-bit=11.3, and 4-bit=6.9 with savings -17.6, 0.0, 8.8, and 13.2 respectively.
- Totals are strictly decreasing as precision drops, and the 16-bit savings is 0.0.
- The row matching the spec's `weight_bits` is the only one flagged selected.
- `build_report()` exposes the comparison; the web page shows all supported totals.

## Non-goals

- New calculator inputs, changes to the VRAM equation, or new constants.
- Throughput, tokens per second, accuracy-loss estimates, or live pricing.

- [x] PRIORITY 1: pure weight-precision comparison layer with savings versus 16-bit
- [x] PRIORITY 2: comparison rendered in the web UI
- [x] PRIORITY 3: README examples for the comparison API and web output

## Blockers
-
-

## COMPLETE ?

- [ ] TRUE
- [ ] FALSE
