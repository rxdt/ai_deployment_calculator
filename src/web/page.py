"""Static one-page HTML renderer for the deployment calculator web UI."""

from __future__ import annotations

from html import escape

from web.presenter import DEFAULT_FORM, FormInputs, spec_from_form
from web.view import DeploymentView, view_from_form

STYLE = """
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; overflow: hidden; background: #f8fafc; color: #111827; }
main { height: 100vh; display: grid; grid-template-columns: 340px 1fr; gap: 24px; padding: 28px; }
section, form { min-width: 0; }
h1, h2, p { margin: 0; }
h1 { font-size: 28px; line-height: 1.1; }
h2 { font-size: 14px; text-transform: uppercase; color: #4b5563; letter-spacing: 0; }
label { display: grid; gap: 6px; font-size: 13px; color: #374151; }
input, select {
  width: 100%; min-height: 40px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px;
}
button {
  min-height: 40px; border: 0; border-radius: 6px; background: #0f766e; color: #fff;
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.panel { border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; padding: 18px; }
.controls { display: grid; gap: 14px; align-content: start; }
.check { grid-template-columns: 20px 1fr; align-items: center; gap: 10px; }
.check input { width: 18px; min-height: 18px; }
.results { display: grid; grid-template-rows: auto auto 1fr; gap: 18px; min-height: 0; }
.hero { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: end; }
.total { font-size: 56px; line-height: .9; font-weight: 800; color: #0f766e; }
.breakdown { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.metric { border-left: 4px solid #2563eb; padding: 8px 10px; background: #f9fafb; }
.metric strong { display: block; font-size: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
th { color: #4b5563; font-size: 12px; text-transform: uppercase; letter-spacing: 0; }
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


def selected_bits(form: FormInputs, bits: int) -> str:
    """Return a select-option marker for the active weight precision."""
    return " selected" if form.weight_bits == bits else ""


def render_breakdown(view: DeploymentView) -> str:
    """Render compact VRAM component metric blocks."""
    rows = [
        f'<p class="metric">{escape(row.label)}<strong>{escape(row.value)}</strong></p>'
        for row in view.breakdown
    ]
    return "\n".join(rows)


def render_hardware_rows(view: DeploymentView) -> str:
    """Render GPU recommendation rows."""
    rows = [
        (f"<tr><td>{escape(row.name)}</td><td>{escape(row.detail)}</td><td>{escape(row.sharding)}</td></tr>")
        for row in view.hardware
    ]
    return "\n".join(rows)


def render_page(form: FormInputs | None = None) -> str:
    """Render the single-screen calculator page for the given form state."""
    active_form = form or DEFAULT_FORM
    view = view_from_form(active_form)
    trained = " checked" if active_form.trained else ""
    adapter = " checked" if active_form.use_adapter else ""
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
        <input name="parameters_b" type="number" min="0.1" step="0.1" value="{active_form.parameters_b:g}">
      </label>
      <label>Context window
        <input name="context_tokens" type="number" min="0" step="1000" value="{active_form.context_tokens}">
      </label>
      <label>Quantization
        <select name="weight_bits">
          <option value="16"{selected_bits(active_form, 16)}>16-bit</option>
          <option value="8"{selected_bits(active_form, 8)}>8-bit</option>
          <option value="4"{selected_bits(active_form, 4)}>4-bit</option>
        </select>
      </label>
      <label class="check"><input name="trained" type="checkbox"{trained}> Model is trained</label>
      <label class="check"><input name="use_adapter" type="checkbox"{adapter}> LoRA adapter</label>
      <button type="submit">Calculate</button>
    </form>
    <section class="results">
      <div class="panel hero">
        <div>
          <h2>{task_label(active_form)}</h2>
          <p>{view.breakdown[0].value} weights, {view.breakdown[1].value} KV, {view.host_ram}</p>
        </div>
        <p class="total">{view.total_vram}</p>
      </div>
      <section class="breakdown" aria-label="VRAM breakdown">
{render_breakdown(view)}
      </section>
      <section class="panel" aria-label="Hardware recommendations">
        <h2>Hardware</h2>
        <table>
          <thead><tr><th>GPU</th><th>Cards</th><th>Mode</th></tr></thead>
          <tbody>
{render_hardware_rows(view)}
          </tbody>
        </table>
      </section>
    </section>
  </main>
</body>
</html>
"""
