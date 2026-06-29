import sys
import logging
from click.testing import CliRunner
from google.agents.cli.main import cli

logging.basicConfig(level=logging.DEBUG)

if __name__ == '__main__':
    runner = CliRunner()
    result = runner.invoke(cli, ['eval', 'grade', '--traces', 'artifacts/traces/generated_traces.json', '--config', 'tests/eval/eval_config.yaml'], catch_exceptions=False)
    print(result.output)
