from pydantic import BaseModel, Field


class ExpenseConfig(BaseModel):
    approval_threshold_usd: float = Field(
        default=100.0, description="Expenses under this amount auto-approve."
    )
    llm_model_name: str = Field(
        default="gemini-3.1-flash-lite", description="LLM to use for risk evaluation."
    )


config = ExpenseConfig()
