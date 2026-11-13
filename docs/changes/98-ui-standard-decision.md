# #98 Record the UI standard decision in the design system document

- Issue: [#98](https://github.com/sirloinbh/workout-memo/issues/98)
- Branch: `docs/98-ui-standard-decision`

## Purpose

The UI standard decision (2026-10-30) existed only in a #98 comment. The 3 completion criteria of the issue are met as follows.

- The chosen standard and reasons, and the rejected candidates and reasons: this PR writes them in the document.
- Confirmation that the npm package risk is understood: not applicable, because no new package is adopted (the decision comment).
- Fixing the work units of the later replacement issues: this PR writes them in the document.

## Change — docs: record the UI standard decision

- I added a section "UI 기준 결정 (#98)" (UI standard decision (#98)) to `docs/design-system.md`.
  - It covers the component standard, the rejected candidates, the design tone, whether there is a new package, Preflight, and the design mock.
  - It lists the follow-up work units (#184, #99, and #101 to #105).
- I did not change the app code or the screens. Applying dark only is done in #184.

## Verification

There is no app behavior change, so I did not add tests.

- I confirmed that `radix-ui` 1.7.0 is in `frontend/package.json`.
- `npm run format`: no files changed other than the two documents in this commit.
- `npm run test:docs`: 3 pass, 0 fail
- Local `npm run check`: I could not complete it. It stopped because of low system memory after going over 10 minutes. The full check is confirmed by PR CI.

## Change — docs: first review follow-up

- I added a transition explanation that dark only is not yet applied until #184.
- I put project-standards#354 into the work unit table, and wrote the origin of the issues I added outside the decision comment (#99 and #105).
- I wrote the fact that package adoption is allowed, the link between Preflight and #100, and the 17 shared components. I counted the number from the non-test files of `components/ui`.
- I made the app-specific component rule point to the section of the central document instead of rewriting it.
- A finding I did not apply: the finding that "#354 before #184" has no basis. It is written under "what must finish first" in the body of #184, so I kept it.
- Re-check: after `npm run format`, only these two documents changed, and `npm run test:docs` 3 pass, 0 fail.

## Change — docs: review record

- First review: I reflected the findings as the "first review follow-up" above.
- Second review: no follow-up items. There are no issues I split off.

## Limits and follow-up

- The bottom tab requirement of #104 conflicts with "하단 탭은 쓰지 않는다" (do not use a bottom tab) in the central `docs/layout.md`. I do not decide it in this document, and I will confirm it with the user in #104.
