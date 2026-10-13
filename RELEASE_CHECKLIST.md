# DevLens 0.1.0-beta.1 release checklist

This is a reviewable beta candidate, **not approval to publish**. The `publisher` value in `package.json` is provisional until the owner confirms the Marketplace identity. Never commit credentials or run `vsce publish` without a separate explicit request.

## Verified in this workspace (2026-10-13)

- [x] TypeScript build and 56 unit tests pass via `npm run test:unit`.
- [x] Synthetic fixture evaluation covers 12 local cases and four generic/tailored prompt pairs; interpretation is in [EVALUATION.md](EVALUATION.md).
- [x] Provider default `gpt-6-astra` is listed in current official OpenAI API documentation and supports the Responses API and structured outputs. Live account access and latency are untested.
- [x] Code inspection found one extension runtime network destination: `https://api.openai.com/v1/responses`, behind disabled-by-default setting, key presence, and per-review confirmation. Mock tests assert declined/local-only reviews make no provider call.
- [x] Runtime storage map and deletion controls are documented in [PRIVACY.md](PRIVACY.md); the request uses `store: false`, which is not Zero Data Retention.
- [x] The generated Marketplace PNG icon is 256×256; metadata, license, support, and changelog files are present.
- [x] `npm pack --dry-run --json` with a temporary npm cache previews 24 files: the compiled JavaScript entry point and modules, icon, manifest, and user-facing docs. It excludes source maps, tests, and source files. This preview does not prove the VSIX includes the runtime `typescript` dependency.
- [x] The compiled unit suite was rerun directly after the final source changes: 56 passed, 0 failed. The manifest and lockfile versions match.
- [x] Git's dataless iCloud index was preserved as a timestamped backup and rebuilt from `HEAD`; `git status --short` and `git diff --check` now pass. The working-tree changes remain visible. This does not verify any staged state that may have existed only in the unavailable original index.
- [x] In the non-iCloud checkout, `npm run test:unit` passes all 56 tests and compiles the extension; `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities in runtime dependencies.
- [x] Built `devlens-0.1.0-beta.1.vsix` with `@vscode/vsce` 4.0.0. The archive is 4.4 MB (158 files), includes the compiled entry point and TypeScript runtime dependency, excludes source, tests, source maps, `.gitignore`, and `tsconfig.json`, passes `unzip -t`, and has no matches for common API-key/private-key patterns.

## Must pass before beta distribution

- [x] Build an actual VSIX with the official `@vscode/vsce` CLI and inspect its file list, size, license, icon, compiled entry point, and runtime TypeScript dependency. `npm pack` is not a VSIX substitute. The VSIX artifact is in the repository root; keep it uncommitted because `*.vsix` is ignored.
- [ ] Confirm the `publisher` ID and unique Marketplace name with the owner. Keep `preview: true` for beta; update version/lockfile together for each build.
- [ ] Run `VSCODE_EXECUTABLE_PATH="/path/to/Code" npm test` on the minimum supported VS Code 1.85 and a current Stable build. In this checkout, tests compile and pass as unit tests, but the host test using the installed Code executable exits with `SIGABRT`; the managed 1.141.0 download stalled at 313.56 MB and was stopped. Determine a working host environment before attributing the abort to DevLens.
- [ ] Manually press F5: open Extension Development Host, find all DevLens commands, review a TypeScript function and Python selection, open the skill profile and practice queue, navigate every panel by keyboard, and confirm loading/error/empty states.
- [ ] Install the VSIX in a clean VS Code user-data and extensions directory; verify activation, commands, local-only reviews, settings, secret setup/removal, and no unexpected network traffic. The CLI install attempt failed with `EMFILE` before installation, and desktop automation timed out. Then update from a prior beta and uninstall; inspect whether local state remains and correct the privacy copy if needed.
- [ ] Run an accessibility pass with keyboard-only navigation, visible focus, screen-reader announcements, contrast in light/dark themes, and zoom. Test cancellation and a 50,000-character review for responsiveness; note timings and any freeze.
- [x] Inspect the VSIX for secrets, fixtures, test output, source maps if not intended, `.git`, local paths, and unrelated files. Archive integrity and file-list checks pass; a pattern scan found no common API-key/private-key formats; `git diff --check` passes.
- [x] Runtime dependency audit passes with zero vulnerabilities. Dev dependency audit was not run.
- [x] The working checkout is outside iCloud Drive; continue release work here to avoid recurrence of the dataless-index issue.
- [ ] Verify the private security-report route in [SUPPORT.md](SUPPORT.md), and have the owner approve or revise the proposed eight-week beta support window.

## Must pass before Marketplace publication

- [ ] Complete the 12-pair synthetic provider evaluation and two-reviewer scorecard in [EVALUATION.md](EVALUATION.md), then fix or qualify failures. Do not describe prompt differences as proven feedback quality.
- [ ] Recruit 5–8 opt-in beta testers; triage feedback on specificity, goal relevance, consent clarity, practice return, and false claims. Retest every release-blocking issue.
- [ ] Confirm publisher ownership and supported authentication method; keep all publishing credentials outside this repository.
- [ ] Review Marketplace listing, 256×256 icon, privacy notice, limitations, version, changelog, and actual packaged files with the owner.
- [ ] Obtain the owner's separate explicit approval for the exact release candidate and external publish action. Only then run the official publish workflow.

## Version and maintenance proposal

Use `0.1.0-beta.N` for iterative beta VSIX builds, then `0.1.0` only after the gates above pass. Increment patch versions for compatible fixes and minor versions for new features; update `CHANGELOG.md` for each release. Proposed beta support: eight weeks after the first tester distribution, with best-effort weekly issue triage and no SLA. The owner must approve the support commitment before distribution. No release date is promised yet.
