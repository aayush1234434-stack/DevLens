# DevLens release evaluation

This is a release gate, not a claim that DevLens detects every defect or performs equally across languages. All fixtures are synthetic. Do not paste tester or proprietary source into issues or this repository.

## Automated baseline — 2026-10-13

Run `npm run test:unit` to execute `test/releaseEvaluation.test.ts` alongside the full suite. The curated set has 12 snippets: JavaScript/TypeScript/JSX/TSX positives and negatives, plus Python, C++, and Java no-claims fallback cases. Four expected local observations were found with exact source ranges; the eight no-finding fixtures produced no local findings. One synthetic Python provider observation with exact evidence was accepted and an invented excerpt was rejected. Four generic-versus-tailored prompt pairs preserved identical source while adding only selected coaching fields. All 56 unit tests passed on 2026-10-13.

These figures are **fixture agreement**, not a field false-positive rate, model quality score, or proof that tailored output is better. The set is deliberately small. The shadowed-`eval` negative case caught a false positive during this phase; the local check now suppresses the claim when the name can be rebound in the submitted file.

| Measure | Current evidence | Remaining gate |
| --- | --- | --- |
| Local finding/range correctness | 12/12 fixture expectations; 4/4 expected ranges exact | Expand with real, permissioned beta reports and regressions. |
| Curated negative cases | 0 findings in 8 no-finding fixtures | Track false positives in beta; a zero here is not a general rate. |
| Genericness and usefulness | Not measured on live model output | Blinded human rating of paired outputs. |
| Goal/depth adaptation | Four prompts contain distinct chosen preferences without changing code | Verify actual suggestions change meaningfully and stay grounded. |
| Languages without local adapters | Python/C++/Java correctly produce no guessed local findings | Evaluate consented provider output separately for each language. |
| Privacy/network | Existing mocked provider and local-only tests pass | Inspect traffic with a real key only after explicit tester consent. |

## Paired mentor-review protocol — ready to run, not yet executed

The synthetic 12-case runner is `npm run evaluate:live`. It sends only those fixtures to `https://api.openai.com/v1/responses` and writes `.vscode-test/live-evaluation.json`, which is gitignored. Set `OPENAI_API_KEY` in your own terminal first; do not paste the key into chat or retrieve it from VS Code SecretStorage. The command records evidence acceptance and latency. It does not assign the human scores below, and it was not run in this session because no key was available.

Use at least 12 synthetic code cases spanning JavaScript, TypeScript, Python, and C++ (three each), including straightforward, ambiguous, and no-action cases. For each case, run the same selected code through the same provider/model twice: once with no coaching profile, once with a self-described level, role, goal, and explanation depth. Cover beginner, mid-level, and senior teaching preferences; include current-level and stretch lenses. Confirm every request with the consent dialog and record cost/latency separately. Do not run this protocol with private user code or a real key without its owner's approval.

Have two reviewers, blind to which output used the profile, score each suggestion:

| Criterion | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Evidence correctness | Invented/mismatched | Excerpt matches but claim overreaches | Excerpt and claim align |
| Specificity | Generic boilerplate | Some code detail | Concrete behavior and trade-off |
| Actionability | No safe next step | Plausible but vague | Small, verifiable next step |
| Goal relevance | Goal ignored or forced | Goal mentioned | Priority/teaching actually changes for goal |
| Teaching depth | Mismatched or judgmental | Acceptable | Appropriate to chosen preference without ability label |

Record severity of any unsupported correctness/security claim separately. Compare paired outputs on reviewer preference and whether tailoring improved goal relevance without increasing false claims. Treat a no-finding review as valid; do not reward padding. Proposed release threshold for this small pilot: zero severe unsupported claims, at least 80% of accepted cards scoring 2 on evidence, at least 70% scoring 2 on actionability, and tailored output preferred in at least 60% of pairs without a higher unsupported-claim count. Review these thresholds with beta feedback; the sample is too small for statistical generalization.

## Beta feedback — pending

Recruit 5–8 opt-in individual developers. Ask them to try selection review, local-only mode, optional consented provider review if they have their own key, one practice card, and a later revisit. Record only ratings and synthetic examples unless they explicitly approve sharing source. Ask whether feedback felt specific and respectful, whether the chosen goal mattered, whether they understood data leaving the computer, and whether they would return to a practice card. Log every release-blocking issue, owner, fix, and retest in `RELEASE_CHECKLIST.md`. Do not publish until the beta and manual host gates are completed or explicitly accepted as limitations by the maintainer.
