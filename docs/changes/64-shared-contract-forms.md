# #64 Shared Zod contract and per-field input validation with React Hook Form

- Issue: [#64](https://github.com/sirloinbh/workout-memo/issues/64) (roadmap [#3](https://github.com/sirloinbh/workout-memo/issues/3), step 3: screen foundation, and step 2: shared contract)
- Branch: `feat/64-shared-contract-forms`. Stacked on #62 (PR #63). The merge order is #59 → #61 → #63 → this PR.

## Purpose

- The input rules (dates, total weight 0 to 99999 kg, reps 1 to 1000, and text length) were only in the server Zod schema. The screen blocked only some of them with HTML attributes.
- Server errors were shown on one line with default English messages such as "String must contain…".

## Change — 2026-10-20

### Shared contract

- I created the source `shared/contract.ts`.
  - It includes the schemas for dates, journals and sets, machines, goals, and body records, and `fieldErrors` (a message per path).
  - The messages are in Korean, and the particles follow the final consonant of the last character (for example 운동명을 (exercise name, object particle), 반복 수는 (reps, topic particle)).
  - The goal end date error is attached to the `deadline` path.
- `scripts/contract.mjs` and npm scripts
  - `npm run contract:sync`: copies the source to `backend/src/contract.ts` and `frontend/src/contract.ts`.
  - `npm run contract:check`: it is included in `npm run check`. It fails if a copy differs, and ignores CRLF differences.
- Why copying instead of a workspace package: the `frontend` and `backend` Docker build contexts and the subtree repos must each build from their own directory alone. This is also the same as the existing skill copies (`skills/` → `.claude/skills/`).
- `backend/src/domain.ts` re-exports the shared schemas. The existing import paths and the place of server validation stay as they are. The routine, query range, and official reference value query schemas stay in domain.ts.
- A server 400 response now returns the Korean messages of the shared schema. No test depended on the English messages.

### Packages

I installed them after the user's explicit approval that they are aware of the supply chain risk.

- Installed in frontend: zod 3.25.76 (the same version as the backend), react-hook-form 7.89.0, and @hookform/resolvers 5.9.1. Pinned to exact versions, with `--ignore-scripts`.
- 2 packages were newly added (react-hook-form and @standard-schema/utils), and there is no install script.
- I regenerated the `frontend/package-lock.json` for the subtree with `--before=2026-10-06`.

### Screens

- **Goal form**: I split it into a `GoalForm` component and changed it to React Hook Form + `zodResolver(goalSchema)`.
  - It uses `noValidate` to show the contract messages instead of the browser's default messages.
  - Numbers are taken with `valueAsNumber`. An empty value becomes the error "숫자로 입력하세요" (enter a number).
- **Journal form**: the draft, retry, and set completion state are tied to the existing state and the localStorage draft, so I did not move it to RHF. Instead, it checks with `workoutSchema.safeParse` right before saving.
  - On failure it sends no request. It shows the status "입력을 확인하세요 · 서버로 보내지 않았습니다" (check your input · not sent to the server), and shows the errors for the date, title, number of sets, and each set's exercise name, total weight, reps, and RPE.
  - The body sent to the server and the retry fingerprint are the same as before.
- **Machine form**: it checks with `machineSchema.safeParse` right before saving and shows the brand, name, and default weight errors.
- **Accessibility**: the error text goes in `.field-error` outside the `label`. The input gets `aria-invalid="true"` and `aria-describedby` linked. The text is outside the label, so the accessible name of the input does not change.
- Closing the modal clears remaining errors.

## Tests

New tests:

- `frontend/src/forms.test.tsx` (3 tests)
  - Goal: submitting empty values gives the exercise name and total weight errors, an end date before the start date gives the end date error, and there are 0 requests. After fixing it correctly, 1 POST is sent with a numeric body.
  - Journal: a total weight of 100000 and a missing exercise name in the second set are linked to each input. They are not shown on the normal fields, and there are 0 requests. After a fix, it saves with 3 sets.
  - Machine: without a brand and name, it shows errors with no create request.
- `backend/test/contract.test.ts` (3 tests)
  - The Korean messages per set path and the particles, and the empty set array error
  - The goal end date error is attached to the `deadline` path
  - The API 400 response returns the same messages (it does not reach storage)
- `scripts/test/contract.test.mjs` (2 tests): the repo copies match the source, and it finds a changed or missing copy and ignores CRLF differences

Existing test change:

- I changed `openNew` in `frontend/src/set-completion.test.tsx` to fill the exercise name in all 3 default sets. The old test saved the 2nd and 3rd sets with an empty exercise name. A real server would reject that input with 400, and only the mock server accepted it. The thing under test (sending the set completion state) is unchanged.

Run results (Node 24.21.0, dedicated test DB, local Chrome):

| Check                                           | Result                         |
| ----------------------------------------------- | ------------------------------ |
| `npm run check` (including `contract:check`)    | **EXIT=0**                     |
| Backend node:test (with DB)                     | **275 pass / 0 fail / 0 skip** |
| Frontend Vitest                                 | **85 pass / 0 fail**           |
| Contract sync test                              | 2 pass                         |
| `npm run test:e2e`                              | **2 passed**                   |
| `docker build ./frontend`, `./backend`          | Both succeed                   |

## Limits and follow-up

- I did not move the journal and machine forms to RHF. The draft saving, the retry key, and the protection against repeated taps on set complete are tied to the existing state logic. To move this behavior to RHF, a separate issue must first split the draft saving structure.
- The routine and body record forms use the existing server validation as it is. The body record schema is in the contract, so applying it to the screen is follow-up work.
- Generating OpenAPI docs proceeds separately as the remaining work of step 2.
