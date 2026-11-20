# #784 workout-memo: the frontend imports shared/contract.ts directly

Part of project-standards#784. After #770 the Docker builds use the repo root, so the frontend no longer needs its own copy.

## Change

| File                               | Content                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `frontend/src/**` (16 files)       | `from './contract'` becomes a relative import of `shared/contract` |
| `frontend/src/contract.ts`         | Deleted                                                            |
| `knip.json`                        | The frontend copy is no longer an ignored entry                    |
| `docs/api.md`, `AGENTS.project.md` | One copy (backend) is described                                    |

The managed `frontend/tsconfig.json` already includes `../shared` (project-standards#845). The backend keeps `backend/src/contract.ts` because its `tsc` build is rooted at `src/`; `npm run contract:sync` writes only that file.

## Checks

- `npm run check`: see the PR.
