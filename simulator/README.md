# AgentShield Simulator

Simulates AI agent tool requests for testing the security gateway end-to-end.

## Status

Placeholder — implementation planned for Phase 5.

## Planned Scenarios

| Scenario | Description |
|----------|-------------|
| `basic_read_write` | Agent reads and writes to a repository — expect ALLOW |
| `credential_access` | Agent attempts to read `.env` — expect DENY |
| `scope_escalation` | Agent gradually escalates from read to write to delete — expect REVIEW then DENY |
| `rapid_fire` | Agent sends high-frequency requests — expect risk score to increase |
| `trajectory_attack` | Agent performs a sequence that individually looks benign but is suspicious in aggregate |

## Usage (Planned)

```bash
cd simulator
python simulator.py --gateway http://localhost:8080 --scenario basic_read_write
```
