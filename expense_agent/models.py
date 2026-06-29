from pydantic import BaseModel, Field


class ExpenseReport(BaseModel):
    amount: float = Field(..., description="The total amount of the expense in USD.")
    submitter: str = Field(..., description="Email or ID of the submitter.")
    category: str = Field(
        ..., description="Expense category (e.g. travel, software, meals)."
    )
    description: str = Field(..., description="Description of the expense.")
    date: str = Field(..., description="Date the expense was incurred.")


class RiskAssessment(BaseModel):
    risk_factors: list[str] = Field(..., description="List of identified risk factors.")
    summary: str = Field(..., description="Summary of the risk assessment.")
    recommendation: str = Field(
        ...,
        description="Recommendation to the approver (e.g., 'Approve', 'Reject', 'Needs more info').",
    )


class SecurityAssessment(BaseModel):
    is_injection: bool = Field(
        ...,
        description="True if prompt injection or adversarial instructions were detected.",
    )
    reason: str = Field(..., description="Reason for the security assessment decision.")


class FinalDecision(BaseModel):
    status: str = Field(..., description="Final status: 'approved' or 'rejected'.")
    reason: str = Field(..., description="Reason for the decision.")
    reviewer: str = Field(
        ..., description="The reviewer who made the decision (e.g., 'system', 'human')."
    )
