# DevLens privacy and data handling

DevLens runs local JavaScript/TypeScript checks without an account or network request. Remote mentor reviews are disabled by default. The extension has no DevLens backend, telemetry, cloud history, or training pipeline.

## What stays in VS Code

| Data | Storage and control |
| --- | --- |
| Coaching preferences (experience teaching preference, current/target role, goal, lens) | VS Code extension `globalState`; setup is skippable, and **DevLens: Clear Coaching Profile** clears it. |
| Explanation depth/style and remote-review switch/model | Ordinary VS Code settings. VS Code may sync settings if the user enables its Settings Sync; DevLens does not register its extension state for sync. |
| OpenAI API key | VS Code SecretStorage; **DevLens: Remove OpenAI API Key** deletes it. It is never placed in code or ordinary settings. |
| Mentor memory | Off by default. After explicit opt-in, versioned `globalState` records contain dates, language IDs, goal-epoch IDs, finding category/kind/tag, and explicit feedback—no source text, snippets, filenames, paths, or keys. Retention defaults to 25 reviews (configurable 1–100). Inspect, pause, delete, and clear controls are in **DevLens: Manage Mentor Memory**. |
| Skill profile | Derived on demand from retained mentor-memory tags. Only visibility/baseline preferences are stored separately. Hide/reset/restore controls are in the profile panel. |
| Practice queue | Saved only after **Practice this** confirmation. Separate versioned `globalState` records contain a concept tag, category, language ID, goal epoch, dates, status, and optional saved-review ID; no source, excerpt, lesson text, or goal text. Up to three open and 25 total cards. Pause, complete, dismiss, delete, and clear controls are in **DevLens: Open Practice Queue**. |

The source and provider response are shown transiently in the current review panel. DevLens does not add them to mentor memory or practice records. Clearing mentor memory does not automatically clear practice cards, and deleting a practice card does not delete mentor memory. Use both controls if you want both sets removed. Uninstall behavior for extension storage has not yet been verified in a clean host; clear data in-app before uninstalling if removal matters to you.

## When code can leave your computer

If you enable optional OpenAI reviews, set your own API key, and approve an individual review, DevLens sends one bounded review context (at most 50,000 characters), the VS Code language ID, explanation settings, and only the non-empty coaching fields disclosed in the consent dialog to `https://api.openai.com/v1/responses`. DevLens does not add the filename, workspace path, other files, mentor-memory records, skill profile, or practice queue. The selected code itself can contain secrets or paths, so inspect it before approving. The extension cannot guarantee automatic secret redaction. Declining, leaving remote review disabled, or using local-only checks makes no provider request.

The API request sets `store: false`, which disables Responses application-state storage for this request; it does **not** by itself provide Zero Data Retention. OpenAI's [API data controls](https://developers.openai.com/api/docs/guides/your-data) describe possible abuse-monitoring retention and account-level controls. API usage may incur charges under your own account. DevLens does not log request code, prompts, provider bodies, profile details, or credentials. OpenAI processing is governed by your API account terms and settings, not by this extension's local storage controls.

## Security boundaries and limitations

Provider output is schema-validated and evidence excerpts are checked against the submitted source, but this does not guarantee correct advice. Local checks are intentionally narrow and currently cover only JavaScript/TypeScript. Other languages can be captured, but local-only mode makes no language-specific claims for them. Feedback is coaching, not a security audit or proof of correctness. There is no automatic edit or execution of reviewed code.

For privacy or security reports, see [SUPPORT.md](SUPPORT.md). This document should be rechecked during each release, particularly after changing provider, storage, or telemetry behavior.
