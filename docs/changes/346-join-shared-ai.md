# #346 Join the shared-ai network

## Change

- `compose.yaml`: the API joins the external network `shared-ai` with the alias `workout-memo-api` and gets `AI_TOOLS_PUBLIC_KEY`.
- `.env.example`: `AI_TOOLS_PUBLIC_KEY`, read on deploy from SSM `/sirloinbh/shared/ai-tools-public-key`.

## Why

shared-ai (project-standards#611, ADR-0017) reads and calls this app's tools (#334) at `http://workout-memo-api:3101/internal/tools`. The tools are on only when the public key is set.

## Verification

- `node .standards/check.mjs`: no compose, port, or SSM tag problem (only the shared packages, which need `npm ci`).
- The managed `deploy/remote-deploy.sh` creates the `shared-ai` network when missing (project-standards#655, via the sync PR), so this merges after that sync PR.

## Effect

- Until the user stores the key in SSM, the deploy warns that it could not read it and the tools stay off. The app works as before.
- Locally, run `docker network create shared-ai` once.
