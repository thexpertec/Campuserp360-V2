---
name: Restoring artifacts from a backup/zip
description: How to re-register existing artifacts after restoring a multi-artifact repo, since platform registration does not travel with the files.
---

# Restoring a multi-artifact project from a backup

**Rule:** Artifact *files* (`artifacts/*/.replit-artifact/artifact.toml`, source, etc.) live in the repo, but the platform's artifact **registration** (what `listArtifacts()` returns and what creates each artifact's workflow) is platform-side state that does NOT come along when you copy/restore a repo from a zip. After a restore you will typically see only the scaffold's original artifact(s) registered.

**Why:** In the Replit path-router model, registering an artifact is what auto-creates its dev workflow and includes it in the routed deployment. `createArtifact` scaffolds a fresh artifact and fails on existing non-empty dirs, so it can't be used to "adopt" restored artifacts. Restart / module-install / pnpm install do NOT auto-register them.

**How to apply:** Call `verifyAndReplaceArtifactToml({ tempFilePath, artifactTomlPath })` on an existing artifact.toml (copy the file to a temp path first, then replace it with itself). This validate-and-replace triggers a full rescan that registers ALL artifacts found under `artifacts/*` that have a valid artifact.toml — not just the one you touched. Verify with `listArtifacts()` and `listWorkflows()`; then start each workflow. An artifact with an empty/legacy artifact.toml (e.g. a dev-only gateway proxy) stays unregistered, which is usually fine.
