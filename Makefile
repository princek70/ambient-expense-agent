.PHONY: install playground lint test run serve clean generate-traces grade

# ──────────────────────────────────────────────
# Install all dependencies (runtime + dev + lint)
# ──────────────────────────────────────────────
install:
	uv sync --dev --extra lint --extra eval

# ──────────────────────────────────────────────
# Launch the ADK 2.0 interactive playground UI
# ──────────────────────────────────────────────
playground:
	agents-cli playground --port 8080

# ──────────────────────────────────────────────
# Lint + format + type-check
# ──────────────────────────────────────────────
lint:
	agents-cli lint --fix

# ──────────────────────────────────────────────
# Run unit + integration tests
# ──────────────────────────────────────────────
test:
	uv run pytest tests/unit tests/integration -v

# ──────────────────────────────────────────────
# Quick CLI run (pass PAYLOAD on the command line)
#   make run PAYLOAD='{"expense":{...}}'
# ──────────────────────────────────────────────
run:
	agents-cli run '$(PAYLOAD)'

# ──────────────────────────────────────────────
# Stand up the ambient event-driven web service
# ──────────────────────────────────────────────
serve:
	uv run python expense_agent/fast_api_app.py

# ──────────────────────────────────────────────
# Remove caches and build artifacts
# ──────────────────────────────────────────────
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache .ruff_cache dist build *.egg-info

# ──────────────────────────────────────────────
# Evaluation targets
# ──────────────────────────────────────────────
generate-traces:
	uv run python tests/eval/generate_traces.py

grade:
	agents-cli eval grade --traces artifacts/traces/generated_traces.json --config tests/eval/eval_config.yaml
