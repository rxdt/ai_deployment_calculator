"""Pure presenter bridging the one-page form controls to the deployment report.

PRIORITY 3 of specs/vram_calculator.md exposes exactly five form controls: a trained
checkbox, a quantization dropdown, parameters, a context window, and a secondary-adapter
(LoRA) toggle. This module translates those controls into a validated `DeploymentSpec`
and report, so the Reflex page renders one pure call instead of mapping inputs itself.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from report import DeploymentReport, build_report
from vram_calculator import Bits, DeploymentSpec, Task


class FormInputs(BaseModel):
    """The one-page form's raw controls, mirroring the PRIORITY 3 input list."""

    parameters_b: float = Field(gt=0)
    context_tokens: int = Field(ge=0)
    weight_bits: Bits = 16  # Quantization dropdown; KV stays 16-bit, so it is not a control.
    trained: bool = False  # "Model is trained" checkbox: unchecked means pure inference.
    use_adapter: bool = False  # Secondary LoRA adapter: distinguishes QLoRA from full training.


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
