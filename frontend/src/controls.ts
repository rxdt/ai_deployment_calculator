export function syncAdapterControl(app: HTMLDivElement): void {
  const trained = app.querySelector<HTMLInputElement>('input[name="trained"]');
  const adapter = app.querySelector<HTMLInputElement>('input[name="use_adapter"]');
  if (!trained || !adapter) {
    return;
  }
  adapter.disabled = !trained.checked;
  if (!trained.checked) {
    adapter.checked = false;
  }
}

export function syncArchitectureControl(app: HTMLDivElement): void {
  const architecture = app.querySelector<HTMLSelectElement>('select[name="architecture"]');
  const activeParameters = app.querySelector<HTMLInputElement>('input[name="active_parameters_b"]');
  if (!architecture || !activeParameters) {
    return;
  }
  activeParameters.disabled = architecture.value !== "moe";
}
