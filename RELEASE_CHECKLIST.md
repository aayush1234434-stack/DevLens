# DevLens 0.1.0-beta.1 release checklist

The owner asked to publish after blockers are solved. The owner supplied `AayushSingh1713` as the publisher ID and approved the eight-week beta support window; the display name is now `DevLens Code Mentor`. Publisher portal access, test gates, and beta feedback remain blockers. Never commit credentials or run `vsce publish` until those release gates pass.

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
- [x] Retest on 2026-10-13: `npm run test:unit` passes all 56 tests; full `npm audit --audit-level=high` reports zero vulnerabilities, including development dependencies.
- [x] Built `devlens-0.1.0-beta.1.vsix` with `@vscode/vsce` 4.0.0. The archive is 4.4 MB (158 files), includes the compiled entry point and TypeScript runtime dependency, excludes source, tests, source maps, `.gitignore`, and `tsconfig.json`, passes `unzip -t`, and has no matches for common API-key/private-key patterns.
- [x] The original `devlens.devlens@0.1.0-beta.1` VSIX installed into fresh isolated VS Code directories, was recognized by `--list-extensions`, then uninstalled from the registry. After the owner supplied `AayushSingh1713`, the package was rebuilt and its archive integrity and embedded identity (`AayushSingh1713.devlens@0.1.0-beta.1`) were verified. A new-profile installation attempt for this identity failed with `EMFILE`; its activation and uninstall remain unverified.
- [x] After the owner approved the eight-week support window and supplied the publisher ID, updated the Marketplace display name to `DevLens Code Mentor`, rebuilt the 158-file VSIX, and reran the 56 unit tests and full dependency audit; both pass. `vsce show AayushSingh1713.devlens` reports no listing currently published at that ID.

## Must pass before beta distribution

- [x] Build an actual VSIX with the official `@vscode/vsce` CLI and inspect its file list, size, license, icon, compiled entry point, and runtime TypeScript dependency. `npm pack` is not a VSIX substitute. The VSIX artifact is in the repository root; keep it uncommitted because `*.vsix` is ignored.
- [ ] Verify the supplied `AayushSingh1713` publisher ID in the signed-in Marketplace publisher portal and confirm listing identity. `vsce show AayushSingh1713.devlens` found no existing extension, and the display name is `DevLens Code Mentor`; neither result proves publisher ownership or availability. Keep `preview: true` for beta; update version/lockfile together for each build.
- [ ] Run `VSCODE_EXECUTABLE_PATH="/path/to/Code" npm test` on the minimum supported VS Code 1.85 and a current Stable build. Retested with 1.85.0 (downloaded successfully), 1.140.0, and installed Stable 1.141.0; all extension-host processes exit with `SIGABRT` before test results. The macOS crash report shows the abort inside AppKit application registration before extension code. A LaunchServices launch attempt could not find an executable in either app bundle. Retest on a working desktop host before attributing the abort to DevLens.
- [ ] Manually press F5: open Extension Development Host, find all DevLens commands, review a TypeScript function and Python selection, open the skill profile and practice queue, navigate every panel by keyboard, and confirm loading/error/empty states.
- [ ] Verify installed activation, commands, local-only reviews, settings, secret setup/removal, and no unexpected network traffic in the clean profile. The original `devlens.devlens` candidate installed/uninstalled from `/private/tmp`, but a later install attempt for `AayushSingh1713.devlens` failed with `EMFILE: too many open files, watch`. Running from the project directory had also failed with `EMFILE`. The available extension-host test exits with `SIGABRT` before tests, and desktop accessibility could not inspect the window. A forced reinstall of the original same-version package worked; upgrade behavior is not tested. Confirm cleanup after process exit and local-state behavior; correct privacy copy if needed.
- [ ] Run an accessibility pass with keyboard-only navigation, visible focus, screen-reader announcements, contrast in light/dark themes, and zoom. Test cancellation and a 50,000-character review for responsiveness; note timings and any freeze.
- [x] Inspect the VSIX for secrets, fixtures, test output, source maps if not intended, `.git`, local paths, and unrelated files. Archive integrity and file-list checks pass; a pattern scan found no common API-key/private-key formats; `git diff --check` passes.
- [x] Full dependency audit, including development dependencies, passes with zero vulnerabilities (`npm audit --audit-level=high`, 2026-10-13).
- [x] The working checkout is outside iCloud Drive; continue release work here to avoid recurrence of the dataless-index issue.
- [ ] Verify the private security-report route in [SUPPORT.md](SUPPORT.md). The owner approved the eight-week beta support window on 2026-10-13. The public GitHub API confirms the repository is public but does not expose the private-reporting setting; the available `gh` login token is invalid, so an authenticated owner check is still required.

## Must pass before Marketplace publication

- [ ] Complete the 12-pair live provider evaluation and two-reviewer scorecard in [EVALUATION.md](EVALUATION.md), then fix or qualify failures. The synthetic fixture suite passes, but no live evaluation was run; no API key is available to this process. Do not retrieve or expose a key from VS Code SecretStorage.
- [ ] Recruit 5–8 opt-in beta testers; triage feedback on specificity, goal relevance, consent clarity, practice return, and false claims. Retest every release-blocking issue.
- [ ] Confirm publisher portal access and supported authentication method; keep all publishing credentials outside this repository. Owner supplied `AayushSingh1713`; `vsce verify-pat AayushSingh1713` failed authorization (`TF400813`). VSCE also reported its secure credential store unavailable and a clear-text fallback path, so do not log in through this environment until secure storage is available.
- [ ] Review Marketplace listing, 256×256 icon, privacy notice, limitations, version, changelog, and actual packaged files with the owner.
- [x] Owner explicitly requested publication after blockers are solved (2026-10-13). Reconfirm the exact final version/artifact after remaining gates; do not publish until they pass and valid publisher authorization is available.

## Version and maintenance proposal

Use `0.1.0-beta.N` for iterative beta VSIX builds, then `0.1.0` only after the gates above pass. Increment patch versions for compatible fixes and minor versions for new features; update `CHANGELOG.md` for each release. Approved beta support: eight weeks after the first tester distribution, with best-effort weekly issue triage and no SLA. No release date is promised yet.
