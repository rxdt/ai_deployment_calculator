# AI Deployment Calculator

A static single-page Vite + TypeScript app for estimating AI deployment VRAM.
The calculator runs in the browser: `CalculatorApp` normalizes form state, calls
local `buildReport(state)`, and renders the report synchronously. There is no
Python or FastAPI backend, and no `/api/report` route.

## App Shape

- Source lives in `frontend/`.
- Production builds are static files in `frontend/dist/`.
- Runtime profiles are `Local / Edge` and `Server / Cloud`.
- Cloud cost appears only for the `Server / Cloud` runtime profile.

## Inputs

The form includes workload family, total resident parameters, parameter unit,
precision, execution mode, runtime profile, and adaptive workload inputs:
context or sequence tokens, encoder-decoder input and output tokens, image
dimensions, video resolution and frames, audio length, tabular rows and
features, or a custom input size preset. Inference shows `Concurrent Requests`;
training modes show `Training Batch Size` with a `Micro Batch Size`
accessibility label.

Advanced assumptions include KV cache precision, known model file size, GPU
resident fraction, LoRA trainable percent, optimizer, GPU comparison, cloud cost
override, exact transformer architecture, and gradient checkpointing. `MoE Model`
is available only for supported workload families, with `Active Parameters`
shown after MoE is enabled.

## Outputs

Reports show total required memory, recommended hardware, minimum raw VRAM
needed, workload speed, accuracy, assumptions, warnings, and the calculation
used. The memory breakdown hides zero rows and can include model or pipeline
weights, KV cache, input or activation memory, training state, runtime overhead,
and safety buffer.

Recommended hardware includes the usable VRAM target and the raw VRAM math.
Cloud cost is omitted for `Local / Edge`.

## Run

```sh
cd frontend
npm ci
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173`. The report is computed locally from the form
state; calculating does not make a network request.

Build a static bundle with:

```sh
cd frontend
npm run build
```

Preview the built app with:

```sh
cd frontend
npm run preview
```

## Check

```sh
cd frontend
npm run gate
```

`gate` runs the frontend lint, type, security, build, and test checks, frontend
harness self-tests, and the repo Python harness gate. The git pre-commit hook
runs `.venv/bin/harness preflight`; the pre-push hook runs
`.venv/bin/harness gate`.
