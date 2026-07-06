---
name: Python (Streamlit) artifact build on Replit
description: How to build a Python artifact's production deps when only requirements.txt exists (no pyproject/uv.lock).
---

# Python artifact production build

**Rule:** `uv sync` / `uv sync --frozen` requires a `pyproject.toml` (and `--frozen` needs a `uv.lock`). If an artifact only ships a `requirements.txt`, `uv sync` fails the production build. Build instead with:
`uv venv .pythonlibs && VIRTUAL_ENV=/home/runner/workspace/.pythonlibs uv pip install -r <path>/requirements.txt`
and run the app from `.pythonlibs/bin/<binary>` (e.g. streamlit). Both commands are idempotent.

**Why:** A backup's artifact.toml may reference `uv sync` even though no pyproject/lock exists, so the deploy build breaks. Matching the venv path used by the production `run` command is what makes the installed binary resolvable at runtime.

**How to apply:** Keep each Python artifact's dependency install inside its OWN `services.production.build` so it builds independently of other artifacts (path-router deploys build/run artifacts separately). Don't rely on a sibling artifact's build script to install shared Python deps.
