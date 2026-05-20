# Python Agents

2 agents for Python async correctness and Django/FastAPI backend safety.

---

### `python-async-correctness-auditor`
**Role:** Blocking I/O calls (network, disk, sleep) inside async functions, missing `await` on coroutines, `asyncio.run()` inside running event loop, unsafe thread/async mixing.
**Model:** sonnet **When:** before merge on Python async code changes
**Returns:** async correctness findings with severity
**Related:** delegates migration/ORM concerns to `django-fastapi-safety-auditor`
**Install:** `npx @loopskills/claude-skills --agents python-async-correctness-auditor`

---

### `django-fastapi-safety-auditor`
**Role:** Migration squash correctness, ForeignKey cascade risks, RunSQL injection risks, N+1 query patterns, serializer/validator compatibility, missing transaction wrapping.
**Model:** sonnet **When:** before merge on Django migrations / models / views, FastAPI routers
**Returns:** backend safety findings with severity
**Related:** delegates async correctness to `python-async-correctness-auditor`
**Install:** `npx @loopskills/claude-skills --agents django-fastapi-safety-auditor`
