"""Static one-page HTML renderer for the deployment calculator web UI."""

from __future__ import annotations

from html import escape

from web.fragments import (
    render_assumptions,
    render_breakdown,
    render_comparison_rows,
    render_hardware_rows,
)
from web.presenter import DEFAULT_FORM, FormInputs, deployment_task, spec_from_form
from web.view import view_from_form

STYLE = """
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; overflow: hidden; background: #0f172a; color: #e5edf7; }
main { height: 100vh; display: grid; grid-template-columns: 340px 1fr; gap: 24px; padding: 28px; }
section, form { min-width: 0; }
h1, h2, p { margin: 0; }
h1 { font-size: 28px; line-height: 1.1; }
h2 { font-size: 14px; text-transform: uppercase; color: #93c5fd; letter-spacing: 0; }
label { display: grid; gap: 6px; font-size: 13px; color: #cbd5e1; }
input, select {
  width: 100%; min-height: 40px; border: 1px solid #334155; border-radius: 6px; padding: 8px 10px;
  background: #0b1220; color: #f8fafc;
}
button {
  min-height: 40px; border: 0; border-radius: 6px; background: #14b8a6; color: #042f2e;
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.panel { border: 1px solid #243247; border-radius: 8px; background: #162033; padding: 18px; }
.controls { display: grid; gap: 14px; align-content: start; }
.check { grid-template-columns: 20px 1fr; align-items: center; gap: 10px; }
.check input { width: 18px; min-height: 18px; }
.results { display: grid; grid-template-rows: auto auto 1fr; gap: 18px; min-height: 0; }
.hero { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: end; }
.total { font-size: 56px; line-height: .9; font-weight: 800; color: #2dd4bf; }
.primary { margin-top: 6px; font-weight: 700; }
.breakdown { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.metric { border-left: 4px solid #60a5fa; padding: 8px 10px; background: #111827; }
.metric strong { display: block; font-size: 20px; }
.tables { display: grid; grid-template-columns: 1.15fr .85fr; gap: 18px; align-items: start; }
.selected td { background: #134e4a; font-weight: 700; }
.optimization { margin-top: 12px; color: #cbd5e1; }
.calc { margin-top: 12px; font-size: 12px; color: #cbd5e1; }
.calc summary { cursor: pointer; color: #93c5fd; }
.calc code { display: block; margin-top: 4px; color: #e5edf7; }
.assumptions { margin-top: 12px; display: grid; gap: 4px; font-size: 12px; color: #cbd5e1; }
.assumptions p { display: inline; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 10px 8px; border-bottom: 1px solid #243247; text-align: left; }
th { color: #93c5fd; font-size: 12px; text-transform: uppercase; letter-spacing: 0; }
@media (max-width: 760px) {
  main { height: 100dvh; grid-template-columns: 1fr; grid-template-rows: auto 1fr; gap: 10px; padding: 10px; }
  .panel { padding: 12px; }
  .controls { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .controls h1 { grid-column: 1 / -1; font-size: 22px; }
  .check { grid-template-columns: 18px 1fr; }
  .results { gap: 10px; grid-template-rows: auto auto 1fr; }
  .hero { grid-template-columns: 1fr auto; align-items: center; }
  .breakdown { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .metric { padding: 6px 8px; }
  .metric strong { font-size: 18px; }
  .tables { grid-template-columns: 1fr 1fr; gap: 8px; }
  .total { font-size: 38px; }
  th, td { padding: 7px 6px; font-size: 12px; }
}
"""


def task_label(form: FormInputs) -> str:
    """Return the current task as short UI copy."""
    task = spec_from_form(form).task
    if task == "qlora":
        return "QLoRA"
    if task == "full_training":
        return "Full training"
    return "Inference"


def selected_bits(active_bits: int, bits: int) -> str:
    """Return a select-option marker for an active precision value."""
    return " selected" if active_bits == bits else ""


def selected_architecture(active_architecture: str, architecture: str) -> str:
    """Return a select-option marker for the active model architecture."""
    return " selected" if active_architecture == architecture else ""


def render_page(form: FormInputs | None = None) -> str:
    """Render the single-screen calculator page for the given form state."""
    active_form = form or DEFAULT_FORM
    view = view_from_form(active_form)
    active_task = deployment_task(active_form)
    trained = " checked" if active_task != "inference" else ""
    adapter = " checked" if active_task == "qlora" else ""
    adapter_disabled = "" if active_task != "inference" else " disabled"
    active_parameters_disabled = "" if active_form.architecture == "moe" else " disabled"
    active_parameters_value = active_form.active_parameters_b or 1.3
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VRAM Deployment Calculator</title>
  <style>{STYLE}</style>
</head>
<body>
  <main>
    <form class="panel controls" method="get" aria-label="Deployment inputs">
      <h1>VRAM Deployment Calculator</h1>
      <label>Parameters (billions)
        <input name="parameters_b" type="number" min="0.000001" step="any"
          value="{active_form.parameters_b:g}">
      </label>
      <label>Context window
        <input name="context_tokens" type="number" min="0" step="1000" value="{active_form.context_tokens}">
      </label>
      <label>Quantization
        <select name="weight_bits">
          <option value="32"{selected_bits(active_form.weight_bits, 32)}>32-bit</option>
          <option value="16"{selected_bits(active_form.weight_bits, 16)}>16-bit</option>
          <option value="8"{selected_bits(active_form.weight_bits, 8)}>8-bit</option>
          <option value="4"{selected_bits(active_form.weight_bits, 4)}>4-bit</option>
        </select>
      </label>
      <label>KV cache
        <select name="kv_cache_bits">
          <option value="32"{selected_bits(active_form.kv_cache_bits, 32)}>32-bit</option>
          <option value="16"{selected_bits(active_form.kv_cache_bits, 16)}>16-bit</option>
          <option value="8"{selected_bits(active_form.kv_cache_bits, 8)}>8-bit</option>
          <option value="4"{selected_bits(active_form.kv_cache_bits, 4)}>4-bit</option>
        </select>
      </label>
      <label>Architecture
        <select name="architecture">
          <option value="dense"{selected_architecture(active_form.architecture, "dense")}>Dense</option>
          <option value="moe"{selected_architecture(active_form.architecture, "moe")}>MoE</option>
        </select>
      </label>
      <label>Active parameters (billions)
        <input name="active_parameters_b" type="number" min="0.000001" step="any"
          value="{active_parameters_value:g}"{active_parameters_disabled}>
      </label>
      <label class="check"><input name="trained" type="checkbox"{trained}> Model is trained</label>
      <label class="check">
        <input name="use_adapter" type="checkbox"{adapter}{adapter_disabled}> LoRA adapter
      </label>
      <button type="submit">Calculate</button>
    </form>
    <section class="results">
      <div class="panel hero">
        <div>
          <h2>{task_label(active_form)}</h2>
          <p>{view.breakdown[0].value} weights, {view.breakdown[1].value} KV, {view.host_ram}</p>
          <p class="primary">Primary: {escape(view.plan.primary)} ({escape(view.plan.primary_fit)})</p>
        </div>
        <p class="total">{view.total_vram}</p>
      </div>
      <section class="breakdown" aria-label="VRAM breakdown">
{render_breakdown(view)}
      </section>
      <section class="panel" aria-label="Hardware recommendations">
        <div class="tables">
          <section aria-label="Hardware options">
            <h2>Hardware</h2>
            <table>
              <thead><tr><th>GPU</th><th>Cards</th><th>Mode</th></tr></thead>
              <tbody>
{render_hardware_rows(view)}
              </tbody>
            </table>
          </section>
          <section aria-label="Quantization comparison">
            <h2>Quantization</h2>
            <table>
              <thead><tr><th>Bits</th><th>Total</th><th>Saves</th></tr></thead>
              <tbody>
{render_comparison_rows(view)}
              </tbody>
            </table>
          </section>
        </div>
        <p class="optimization">{escape(view.plan.optimization)}</p>
        <details class="calc">
          <summary>Calculation used</summary>
          <code>{escape(view.calculation)}</code>
        </details>
        <section class="assumptions" aria-label="Assumptions">
          <h2>Assumptions</h2>
{render_assumptions(view)}
        </section>
      </section>
    </section>
  </main>
  <script>
    const trained = document.querySelector('input[name="trained"]');
    const adapter = document.querySelector('input[name="use_adapter"]');
    const architecture = document.querySelector('select[name="architecture"]');
    const activeParameters = document.querySelector('input[name="active_parameters_b"]');
    function syncAdapterControl() {{
      adapter.disabled = !trained.checked;
      if (!trained.checked) {{
        adapter.checked = false;
      }}
    }}
    function syncArchitectureControl() {{
      activeParameters.disabled = architecture.value !== "moe";
    }}
    trained.addEventListener("change", syncAdapterControl);
    architecture.addEventListener("change", syncArchitectureControl);
    syncAdapterControl();
    syncArchitectureControl();
  </script>
</body>
</html>
"""
