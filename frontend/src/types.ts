export interface DisplayRow {
  label: string;
  value: string;
}

export interface HardwareRow {
  name: string;
  detail: string;
  sharding: string;
}

export interface ComparisonRow {
  precision: string;
  total: string;
  savings: string;
  selected: boolean;
}

export interface ReportPayload {
  total_vram: string;
  host_ram: string;
  plan: {
    primary: string;
    primary_fit: string;
    optimization: string;
  };
  breakdown: DisplayRow[];
  hardware: HardwareRow[];
  comparison: ComparisonRow[];
  assumptions: DisplayRow[];
  calculation: string;
}

export interface FormState {
  parameters_b: string;
  context_tokens: string;
  weight_bits: string;
  kv_cache_bits: string;
  runtime: string;
  architecture: string;
  active_parameters_b: string;
  trained: boolean;
  use_adapter: boolean;
}

export interface BrowserRuntime {
  history: Pick<History, "replaceState">;
  location: Pick<Location, "search">;
}
