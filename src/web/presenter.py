"""Pure presenter bridging the one-page form controls to the deployment report.

PRIORITY 3 of specs/vram_calculator.md exposes exactly five form controls: a trained
checkbox, a quantization dropdown, parameters, a context window, and a secondary-adapter
(LoRA) toggle. This module translates those controls into a validated `DeploymentSpec`
and report, so the Reflex page renders one pure call instead of mapping inputs itself.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import parse_qs

from report import DeploymentReport, build_report
from vram_calculator import Bits, DeploymentSpec, Task

CHECKED_VALUES = {"1", "true", "on", "yes"}
VALID_BITS = {16, 8, 4}


class FormInputError(ValueError):
    """Raised when form inputs fail local validation."""


@dataclass(frozen=True)
class FormInputs:
    """The one-page form's raw controls, mirroring the PRIORITY 3 input list."""

    parameters_b: float
    context_tokens: int
    weight_bits: Bits = 16  # Quantization dropdown; KV stays 16-bit, so it is not a control.
    trained: bool = False  # "Model is trained" checkbox: unchecked means pure inference.
    use_adapter: bool = False  # Secondary LoRA adapter: distinguishes QLoRA from full training.

    def __post_init__(self) -> None:
        """Validate form inputs without adding a second Pydantic model to `src/`."""
        if self.parameters_b <= 0:
            raise FormInputError
        if self.context_tokens < 0:
            raise FormInputError
        if self.weight_bits not in VALID_BITS:
            raise FormInputError


DEFAULT_FORM = FormInputs(parameters_b=8, context_tokens=8000)  # 8B / 8k first-load deployment.


def weight_bits_from_query(raw_params: dict[str, str]) -> Bits:
    """Parse the optional quantization dropdown value into a supported bit-width."""
    if "weight_bits" not in raw_params:
        return DEFAULT_FORM.weight_bits
    parsed_bits = int(raw_params["weight_bits"])
    if parsed_bits == 16:
        return 16
    if parsed_bits == 8:
        return 8
    if parsed_bits == 4:
        return 4
    raise FormInputError


def form_from_query(query_string: str) -> FormInputs:
    """Build form inputs from a GET query string, falling back to defaults on missing/invalid input.

    Unchecked checkboxes are simply absent from the query, so they take their `False` default; a bad
    or empty submission yields the default deployment rather than an error page.
    """
    raw_params = {key: values[-1] for key, values in parse_qs(query_string).items()}
    if not raw_params:
        return DEFAULT_FORM
    try:
        return FormInputs(
            parameters_b=float(raw_params["parameters_b"]),
            context_tokens=int(raw_params["context_tokens"]),
            weight_bits=weight_bits_from_query(raw_params),
            trained=raw_params.get("trained", "").lower() in CHECKED_VALUES,
            use_adapter=raw_params.get("use_adapter", "").lower() in CHECKED_VALUES,
        )
    except (ValueError, KeyError, FormInputError):
        return DEFAULT_FORM


def deployment_task(form: FormInputs) -> Task:
    """Map the trained checkbox and adapter toggle onto a core task.

    Untrained is inference; a trained run with a LoRA adapter is QLoRA, otherwise full training.
    An adapter without training stays inference, since no gradients or optimizer states are held.
    """
    if not form.trained:
        return "inference"
    return "qlora" if form.use_adapter else "full_training"


def spec_from_form(form: FormInputs) -> DeploymentSpec:
    """Build a validated `DeploymentSpec` from the one-page form controls."""
    return DeploymentSpec(
        parameters_b=form.parameters_b,
        context_tokens=form.context_tokens,
        weight_bits=form.weight_bits,
        task=deployment_task(form),
    )


def report_from_form(form: FormInputs) -> DeploymentReport:
    """Assemble the display-ready deployment report straight from the form controls."""
    return build_report(spec_from_form(form))
