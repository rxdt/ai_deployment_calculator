"""Pure presenter bridging the one-page form controls to the deployment report.

PRIORITY 3 of specs/vram_calculator.md exposes exactly five form controls: a trained
checkbox, a quantization dropdown, parameters, a context window, and a secondary-adapter
(LoRA) toggle. This module translates those controls into a validated `DeploymentSpec`
and report, so the Reflex page renders one pure call instead of mapping inputs itself.
"""

from __future__ import annotations

from collections.abc import Callable
from urllib.parse import parse_qs

from pydantic import BaseModel, Field, ValidationError

from report import DeploymentReport, build_report
from vram_calculator import Bits, DeploymentSpec, Task

CHECKED_VALUES = {"1", "true", "on", "yes"}
NUMERIC_FIELDS: dict[str, Callable[[str], object]] = {
    "parameters_b": float,
    "context_tokens": int,
    "weight_bits": int,
}


class FormInputs(BaseModel):
    """The one-page form's raw controls, mirroring the PRIORITY 3 input list."""

    parameters_b: float = Field(gt=0)
    context_tokens: int = Field(ge=0)
    weight_bits: Bits = 16  # Quantization dropdown; KV stays 16-bit, so it is not a control.
    trained: bool = False  # "Model is trained" checkbox: unchecked means pure inference.
    use_adapter: bool = False  # Secondary LoRA adapter: distinguishes QLoRA from full training.


DEFAULT_FORM = FormInputs(parameters_b=8, context_tokens=8000)  # 8B / 8k first-load deployment.


def query_values(raw_params: dict[str, str]) -> dict[str, object] | None:
    """Coerce raw query-string values into the typed shape expected by `FormInputs`."""
    try:
        params = {key: caster(raw_params[key]) for key, caster in NUMERIC_FIELDS.items() if key in raw_params}
    except ValueError:
        return None
    params.update({
        checkbox: raw_params[checkbox].lower() in CHECKED_VALUES
        for checkbox in ("trained", "use_adapter")
        if checkbox in raw_params
    })
    return params


def form_from_query(query_string: str) -> FormInputs:
    """Build form inputs from a GET query string, falling back to defaults on missing/invalid input.

    Unchecked checkboxes are simply absent from the query, so they take their `False` default; a bad
    or empty submission yields the default deployment rather than an error page.
    """
    raw_params = {key: values[-1] for key, values in parse_qs(query_string).items()}
    if not raw_params:
        return DEFAULT_FORM
    params = query_values(raw_params)
    if params is None:
        return DEFAULT_FORM
    try:
        return FormInputs.model_validate(params)
    except ValidationError:
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
