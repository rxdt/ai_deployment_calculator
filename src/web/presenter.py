"""Pure presenter bridging the one-page form controls to the deployment report.

The web form exposes the deployment fields users need to tune memory: parameters,
context, weight precision, KV-cache precision, training mode, and adapter use. This
module translates those controls into a validated `DeploymentSpec` and report, so the
page renders one pure call instead of mapping inputs itself.
"""

from __future__ import annotations

from dataclasses import InitVar, dataclass, field
from urllib.parse import parse_qs

from vram_calculator import Architecture, Bits, DeploymentSpec, Runtime, Task

CHECKED_VALUES = {"1", "true", "on", "yes"}
VALID_BITS = {32, 16, 8, 4}
BIT_VALUES: dict[str, Bits] = {"32": 32, "16": 16, "8": 8, "4": 4}
ARCHITECTURE_VALUES: dict[str, Architecture] = {"dense": "dense", "moe": "moe"}
VALID_RUNTIMES: set[Runtime] = {"pytorch", "llama_cpp_gguf"}
RUNTIME_VALUES: dict[str, Runtime] = {"pytorch": "pytorch", "llama_cpp_gguf": "llama_cpp_gguf"}


class FormInputError(ValueError):
    """Raised when form inputs fail local validation."""


@dataclass(frozen=True)
class FormInputs:
    """The one-page form's raw controls."""

    parameters_b: float
    context_tokens: int
    weight_bits: Bits = 16
    kv_cache_bits: Bits = 16
    active_parameters_b: float | None = None
    runtime: Runtime = "pytorch"  # Execution runtime: PyTorch carries the safety margin, GGUF drops it.
    task: Task = field(default="inference", init=False)
    trained: InitVar[bool] = False  # "Model is trained" checkbox: unchecked means pure inference.
    use_adapter: InitVar[bool] = False  # Secondary LoRA adapter: distinguishes QLoRA from full training.

    def __post_init__(self, trained: bool, use_adapter: bool) -> None:
        """Validate form inputs without adding a second Pydantic model to `src/`."""
        task: Task = "inference" if not trained else "qlora" if use_adapter else "full_training"
        object.__setattr__(self, "task", task)
        active_parameters_valid = (
            self.active_parameters_b is None or 0 < self.active_parameters_b <= self.parameters_b
        )
        invalid_size = self.parameters_b <= 0 or self.context_tokens < 0
        invalid_precision = self.weight_bits not in VALID_BITS or self.kv_cache_bits not in VALID_BITS
        invalid_runtime = self.runtime not in VALID_RUNTIMES
        if invalid_size or invalid_precision or invalid_runtime or not active_parameters_valid:
            raise FormInputError

    @property
    def architecture(self) -> Architecture:
        """Return dense unless MoE active parameters are present."""
        return "moe" if self.active_parameters_b is not None else "dense"


DEFAULT_FORM = FormInputs(parameters_b=8, context_tokens=8000)  # 8B / 8k first-load deployment.


def form_from_query(query_string: str) -> FormInputs:
    """Build form inputs from a GET query string, falling back to defaults on missing/invalid input.

    Unchecked checkboxes are simply absent from the query, so they take their `False` default; a bad
    or empty submission yields the default deployment rather than an error page.
    """
    raw_params = {key: values[-1] for key, values in parse_qs(query_string).items()}
    if not raw_params:
        return DEFAULT_FORM
    architecture = ARCHITECTURE_VALUES.get(raw_params.get("architecture", DEFAULT_FORM.architecture))
    runtime = RUNTIME_VALUES.get(raw_params.get("runtime", DEFAULT_FORM.runtime))
    if architecture is None or runtime is None:
        return DEFAULT_FORM
    raw_weight_bits = raw_params.get("weight_bits", str(DEFAULT_FORM.weight_bits))
    raw_kv_cache_bits = raw_params.get("kv_cache_bits", str(DEFAULT_FORM.kv_cache_bits))
    if raw_weight_bits not in BIT_VALUES or raw_kv_cache_bits not in BIT_VALUES:
        return DEFAULT_FORM
    try:
        trained = raw_params.get("trained", "").lower() in CHECKED_VALUES
        active_parameters_b = float(raw_params["active_parameters_b"]) if architecture == "moe" else None
        return FormInputs(
            parameters_b=float(raw_params["parameters_b"]),
            context_tokens=int(raw_params["context_tokens"]),
            weight_bits=BIT_VALUES[raw_weight_bits],
            kv_cache_bits=BIT_VALUES[raw_kv_cache_bits],
            trained=trained,
            use_adapter=trained and raw_params.get("use_adapter", "").lower() in CHECKED_VALUES,
            active_parameters_b=active_parameters_b,
            runtime=runtime,
        )
    except (ValueError, KeyError, FormInputError):
        return DEFAULT_FORM


def deployment_task(form: FormInputs) -> Task:
    """Map the trained checkbox and adapter toggle onto a core task.

    Untrained is inference; a trained run with a LoRA adapter is QLoRA, otherwise full training.
    An adapter without training stays inference, since no gradients or optimizer states are held.
    """
    return form.task


def spec_from_form(form: FormInputs) -> DeploymentSpec:
    """Build a validated `DeploymentSpec` from the one-page form controls."""
    return DeploymentSpec(
        parameters_b=form.parameters_b,
        context_tokens=form.context_tokens,
        weight_bits=form.weight_bits,
        kv_cache_bits=form.kv_cache_bits,
        task=deployment_task(form),
        architecture=form.architecture,
        active_parameters_b=form.active_parameters_b,
        runtime=form.runtime,
    )
