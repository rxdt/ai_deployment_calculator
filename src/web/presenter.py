"""Pure presenter bridging the one-page form controls to the deployment report.

The web form exposes the deployment fields users need to tune memory: parameters,
context, weight precision, KV-cache precision, training mode, and adapter use. This
module holds the validated `FormInputs` model and maps it onto a `DeploymentSpec`;
parsing a raw query string into a `FormInputs` lives in `web.form_query`.
"""

from __future__ import annotations

import math
from dataclasses import InitVar, dataclass, field

from vram_calculator import Architecture, Bits, DeploymentSpec, Runtime, Task

CHECKED_VALUES = {"1", "true", "on", "yes"}
VALID_BITS = {32, 16, 8, 4}
BIT_VALUES: dict[str, Bits] = {"32": 32, "16": 16, "8": 8, "4": 4}
ARCHITECTURE_VALUES: dict[str, Architecture] = {"dense": "dense", "moe": "moe"}
DEFAULT_ACTIVE_PARAMETERS_B = 1.3  # Frontend DEFAULT_VALUES.active_parameters_b for missing MoE input.
VALID_RUNTIMES: set[Runtime] = {"pytorch", "llama_cpp_gguf"}
RUNTIME_VALUES: dict[str, Runtime] = {"pytorch": "pytorch", "llama_cpp_gguf": "llama_cpp_gguf"}
INVALID_FORM_MESSAGE = "invalid form input"


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
        active_parameters_valid = self.active_parameters_b is None or (
            math.isfinite(self.active_parameters_b) and 0 < self.active_parameters_b <= self.parameters_b
        )
        # Reject inf/nan to match the frontend's Number.isFinite guard; otherwise the
        # report path produces inf/nan totals or crashes when sizing hardware.
        invalid_size = (
            not math.isfinite(self.parameters_b) or self.parameters_b <= 0 or self.context_tokens < 0
        )
        invalid_precision = self.weight_bits not in VALID_BITS or self.kv_cache_bits not in VALID_BITS
        invalid_runtime = self.runtime not in VALID_RUNTIMES
        if invalid_size or invalid_precision or invalid_runtime or not active_parameters_valid:
            raise FormInputError(INVALID_FORM_MESSAGE)

    @property
    def architecture(self) -> Architecture:
        """Return dense unless MoE active parameters are present."""
        return "moe" if self.active_parameters_b is not None else "dense"


DEFAULT_FORM = FormInputs(parameters_b=8, context_tokens=8000)  # 8B / 8k first-load deployment.


def spec_from_form(form: FormInputs) -> DeploymentSpec:
    """Build a validated `DeploymentSpec` from the one-page form controls."""
    return DeploymentSpec(
        parameters_b=form.parameters_b,
        context_tokens=form.context_tokens,
        weight_bits=form.weight_bits,
        kv_cache_bits=form.kv_cache_bits,
        task=form.task,
        architecture=form.architecture,
        active_parameters_b=form.active_parameters_b,
        runtime=form.runtime,
    )
