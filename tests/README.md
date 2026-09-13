# Tests

Organised test suites for each component of AgentShield.

## Structure

```
tests/
├── backend/          # JUnit integration tests (beyond src/test/)
├── risk-engine/      # pytest tests for scoring logic
├── integration/      # End-to-end tests spanning multiple services
└── README.md
```

## Status

Placeholder — tests will be added alongside each implementation phase.

## Running Tests

### Backend (Maven)
```bash
cd backend
mvn test
```

### Risk Engine (pytest)
```bash
cd risk-engine
pip install -r requirements.txt
pytest test_main.py -v
```

### Integration tests
Planned for Phase 7 — requires all services running via Docker Compose.
