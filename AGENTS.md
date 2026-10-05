# DevLens Instructions for Codex

## Project direction

Read `PROJECT_PLAN.md` before making product changes. This project is a language-agnostic VS Code mentor extension for individual developers. The MVP aims to review code in any programming language VS Code can open as text, with review depth depending on available language-aware analysis. Preserve the planned phase boundaries: implement only the phase the user requests, and do not quietly start later-phase work.

At the start of each implementation phase:

1. Inspect the current repository, its instructions, and working-tree changes.
2. Summarize the intended changes and relevant assumptions before editing.
3. Keep the change small enough to review and test.
4. Update `PROJECT_PLAN.md` when scope, decisions, risks, or phase status change.

Preserve unrelated user changes. Do not overwrite existing work just to match a plan or scaffold. If repository state materially changes the plan, adapt the plan and explain the decision.

## Product and feedback conventions

- Accept code in any language VS Code exposes as a text document. Carry VS Code's language ID through review context. Add language-specific parsers and local checks incrementally; do not claim equal analysis depth for every language until verified. Do not add team features, social features, a large account system, or a backend unless the user explicitly changes scope.
- Make findings specific to the submitted code and anchor each claim to a valid source range or other inspectable evidence.
- Keep feedback concise, constructive, and actionable. Explain what could improve, why it matters, and one possible improvement.
- Distinguish correctness risks from maintainability suggestions and subjective style preferences. Never frame a preference as a definite bug.
- Show strengths only when code evidence supports them. An empty result is acceptable; do not invent praise to fill space.
- Experience level and explanation style are teaching preferences. Do not infer or label the developer's ability.
- Let users optionally self-describe their current experience, current/target role, and active learning goal. Keep setup skippable and editable. Use these fields to adjust explanation depth and relevance, never to claim job readiness or judge the person.
- A profile describes patterns in reviewed code, includes examples and sample counts, and communicates uncertainty. Do not assign person-level grades or compare users.
- Preserve DevLens's product wedge: an individual, evidence-linked learning loop (review → understand → practice → revisit), not a generic one-shot reviewer or a team PR gate. Prefer features that improve continuity, teaching, or user control; do not add breadth for its own sake.
- Treat AI output as untrusted input. It may explain or prioritize locally grounded findings, but must not create unsupported findings or source locations.

## Architecture and coding conventions

- Keep editor integration, source extraction, local analysis, optional provider calls, feedback validation, presentation, and storage separated behind small typed interfaces.
- Prefer TypeScript and the stable VS Code API for the declared engine range. Check current official API documentation when selecting APIs or dependencies that may have changed.
- Use syntax-aware parsing for language-specific source boundaries and evidence when an adapter exists. Keep a safe selection-based fallback for other languages. Avoid brittle text/brace heuristics for code structure.
- Define and validate a versioned feedback schema at provider and Webview boundaries. Validate ranges against the reviewed source.
- Keep local checks deterministic, narrow, and conservative. Do not recreate an entire linter or dump existing diagnostics without a clear teaching benefit.
- Make Webview output safe: escape untrusted content, use a restrictive Content Security Policy, validate every message, and expose only the minimum extension capabilities.
- Follow the repository's established formatting and naming conventions. Keep dependencies minimal and use the repository lockfile.
- Add focused tests alongside each implemented behavior. For an implementation phase, follow the phase plan's relevant verification steps, run the applicable checks, fix failures within scope, and report exactly what ran.

## Privacy and security requirements

- Never silently send source code or workspace data outside the computer. Local-only operation must remain useful and must make no network calls.
- Before any remote review, clearly identify the provider and what code/context will be sent, and require user opt-in. Keep a persistent local-only option.
- Treat experience, role, and goal as personal profile data. Send only fields needed for the current review, disclose them alongside code in the consent UI, and never log them. Keep the profile local unless the user has explicitly approved sending the relevant fields.
- Send only the bounded selection and minimum necessary context. Do not send unrelated files, workspace paths, or repository metadata without a reviewed product requirement and clear disclosure.
- Never hard-code API keys, tokens, or other secrets. Use VS Code SecretStorage for user-provided provider credentials. Do not put secrets in settings, source, fixtures, logs, or documentation examples that resemble real credentials.
- Do not log reviewed source, prompts, provider responses containing source, credentials, or sensitive paths. Ensure errors are useful without leaking these values.
- Keep history off by default until its opt-in design is implemented. Store the minimum data locally, avoid retaining source text by default, and provide inspect, pause, retention, and deletion controls before enabling pattern tracking.
- Do not add telemetry by default. Any proposed telemetry requires a separate explicit product decision and clear opt-in disclosure.
- Treat files, provider output, workspace content, and user-supplied configuration as untrusted. Validate inputs, bound sizes, handle failures safely, and avoid executing generated code.

## Verification and reporting

- Before implementing a phase, inspect its existing scripts and repository state; use the actual package manager and scripts present rather than assuming commands.
- After an implementation, run relevant formatting/lint, typecheck/build, unit and extension-host tests, and package validation described by the phase, fixing failures within scope.
- Do not claim checks passed unless they were run. In the handoff, summarize changes, why they fit the requested phase, exact verification commands and outcomes, and any known limitations.
- For review-only or planning requests, do not make product-code changes unless the user asks.
- Do not publish to the Marketplace, create external accounts, or send code to a provider without explicit user authorization for that action.
