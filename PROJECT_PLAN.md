# DevLens Project Plan

## Product definition

DevLens is a VS Code extension that helps individual developers improve through focused, constructive code reviews across programming languages. A developer can review a selected function or the current file, choose how explanations are pitched, and see a small set of code-specific suggestions. Feedback should identify what is working, explain why an improvement matters, and offer an actionable next step. Over time, the extension can use review history to surface recurring patterns and examples of progress.

DevLens is a learning aid, not a judge, compiler, security scanner, or replacement for code review. It should distinguish evidence-backed correctness concerns from maintainability advice and subjective preferences. An experience level describes the user's preferred teaching depth; it is not an assessment of their ability.

### Initial users

- Individual developers learning or working in any programming language supported as text by VS Code.
- Developers who want useful explanations while working in VS Code, without setting up a team platform or account.
- Users who may prefer local-only analysis or may opt in to sending review context to an AI provider for richer explanations.

### First useful experience (MVP)

The user selects a function in a code file, runs **DevLens: Review Selection**, and receives a short list of specific suggestions in a VS Code panel. Each suggestion includes relevant code evidence, what could improve, why it matters, and one practical improvement. The user can choose an experience level and explanation style. DevLens accepts any code language VS Code exposes as text; analysis depth depends on available language-aware checks and provider capability. Optional AI-assisted explanations require clear disclosure before code is sent.

### Product principles

1. Tie every suggestion to evidence in the reviewed code. Avoid generic advice that could fit any file.
2. Separate likely defects and concrete risks from maintainability recommendations and style preferences.
3. Keep feedback concise, kind, and actionable; include strengths where the code supports them.
4. Treat experience level as a teaching preference, not a personal rating.
5. Explain when review content leaves the computer, what is sent, and which provider receives it. Never upload silently.
6. Offer a local-only mode. Do not require an account or backend for the MVP.
7. Keep keys out of source code, settings files, and logs. Use VS Code SecretStorage for any user-provided credentials.
8. Make review history and pattern tracking understandable, inspectable, and controllable by the user.

## Scope and assumptions

### MVP scope

- VS Code desktop extension that accepts code in any language VS Code opens as a text document.
- Review selected code, with function-aware selection as the primary flow; support reviewing the current file as a secondary flow.
- A Webview panel for structured feedback, initially limited to a few high-value suggestions.
- Language-aware local parsing and deterministic checks, added incrementally where reliable analyzers are available; preserve selected-code capture for other languages.
- Optional AI explanation provider behind an interface, with explicit user choice and a local-only setting.
- User preferences for explanation depth / experience level and concise versus more explanatory feedback.
- Local review history, only after an explicit product choice and with controls to pause, inspect, and clear it.
- No account, hosted service, telemetry by default, team workspace, or social feature. Universal language coverage is a product goal; per-language analysis quality must be evaluated before claims are made.

### Working assumptions to validate during Phase 1

- Start with a TypeScript-based VS Code extension using the stable VS Code Extension API and the standard extension test harness available at implementation time.
- Use a Webview panel for rich review cards rather than relying only on diagnostics. Diagnostics may later represent narrowly scoped, high-confidence findings.
- Carry VS Code's language ID with every review input. Use the TypeScript compiler API for TypeScript/JavaScript syntax and source locations, and add focused adapters for other languages incrementally. Keep checks small and explainable; do not build a general-purpose linter.
- Offer useful local checks without requiring AI. AI is an optional provider for explanation and synthesis, not the source of truth for code locations or fabricated findings.
- Do not build a DevLens server for the MVP. A provider adapter may call a user-selected, documented AI endpoint only after consent. The exact provider and model are a Phase 1 decision.
- Store preferences and any opted-in history in VS Code global/workspace storage as appropriate. Default history to off until its retention and data model are reviewed in Phase 5.
- Prefer supported VS Code APIs and a minimal dependency set; pin and audit dependencies as the extension matures.
- Use the cloned `DevLens/` repository as the project root. It was empty when this plan was written.

## Proposed architecture

Keep modules small and separated so review evidence does not depend on an AI provider:

- **Extension host**: registers commands, reads editor/selection state, gathers preferences, coordinates reviews, and owns storage and secrets.
- **Source adapter**: accepts text documents, carries the VS Code language ID, determines selection/function boundaries when an adapter is available, and builds a bounded review input with source locations.
- **Language adapters and local analysis**: run syntax-aware, deterministic checks where a verified language adapter exists; return typed findings with evidence, confidence, category, and source range. Other languages retain exact selection capture and can use the opted-in general review provider.
- **Review provider interface**: optional provider receives only the minimum user-approved context and returns schema-constrained explanations tied to existing findings. Validate all output; reject unsupported findings, invalid ranges, or malformed responses.
- **Feedback model**: shared, versioned schema for strengths, suggestions, evidence, rationale, actionable example, category, severity/confidence, and provenance (local or provider-assisted).
- **Webview**: renders escaped, accessible feedback cards; applies a strict Content Security Policy and communicates through validated messages.
- **Preferences and history**: separate user settings from review records. History is opt-in, local, bounded, and clearable. Skill summaries derive from tagged examples and are labeled as indicative, never as definitive ratings.

Data flow: editor selection → bounded source context → local findings → optional consented provider explanation → schema validation → panel. The extension should not send workspace paths, unrelated file contents, or secrets. Provider failures should leave local findings available and explain what failed without logging code or credentials.

## Phases and milestones

Each phase is a reviewable increment. Before implementation, inspect the repository and summarize the intended changes. Implement only that phase, run its listed verification, fix failures, and update this plan's status and decisions. Later-phase features remain out of scope until their phase is requested.

### Phase 1 — VS Code extension shell

**Goal and user-visible outcome:** A developer can press F5 to launch a second Extension Development Host window, invoke **Review Selection** or **Review Current File** for code in any language VS Code opens as text, and see a basic DevLens side panel. A settings screen exposes explanation level and style preferences.

**Features included:** TypeScript extension manifest and build; both review commands plus an Open Settings command; a basic side panel with loading, error, and code-captured states; exact selection/current-file capture for text documents in any language ID; safe empty-input behavior; language ID shown in the panel; VS Code settings for explanation level and style; F5 debug configuration; extension-host tests.

**Main implementation tasks:** Declare the supported VS Code engine; scaffold typed source modules and test harness; register commands and settings; capture bounded editor text and show it locally in a Webview panel; escape source text and restrict Webview capabilities; provide launch/task configuration and developer setup instructions.

**Important decisions / dependencies:** Review panel is a shell only and does not yet analyze code or call a provider. Any text document can be captured; VS Code's language ID is retained for later language-aware analysis. Settings use the built-in VS Code Settings UI. No code leaves the machine. Minimum engine is VS Code 1.85.

**Tests and verification Codex should run:** Install dependencies with the committed lockfile; run `npm run compile`; run extension-host tests for activation, command registration, selection capture across different language IDs, empty file/selection, and command invocation; verify F5 launches a second Extension Development Host; run dependency audit and packaging validation when packaging is introduced.

**Acceptance criteria:** A clean checkout builds reproducibly; F5 starts a second Extension Development Host; both review commands and Settings are available; selection text, language ID, and source line range are captured correctly across different language IDs; empty input produces a safe, clear panel error; settings are discoverable; source remains local.

**Explicitly out of scope:** Real review findings, AST/function-boundary extraction, AI calls, history, profiles, telemetry, authentication, and publishing.

**Status:** Implemented. TypeScript compile, local context tests, and dependency audit pass. Automated extension-host launch aborts with `SIGABRT` in this desktop environment, so activation and interactive F5 remain unverified here.

### Phase 2 — VS Code shell and review commands

**Goal and user-visible outcome:** Review preparation becomes function-aware, so a partial selection can be mapped to the smallest relevant function and oversized contexts can be handled deliberately.

**Features included:** AST-based function-boundary detection; behavior for selections spanning functions; review size limits and truncation disclosure; cancellation/progress behavior; panel accessibility refinements.

**Main implementation tasks:** Use TypeScript AST for function and source boundaries; define and test multiple-function selection behavior; cap review context and disclose truncation; improve keyboard navigation and panel lifecycle.

**Important decisions / dependencies:** Depend on Phase 1 command and panel shell. Prefer TypeScript AST boundaries over fragile brace matching. Keep panel content escaped and apply a restrictive Content Security Policy. Never send code externally in this phase.

**Tests and verification Codex should run:** Unit tests for empty, partial, full-function, multiple-function, comment/string brace, and file selections; extension-host command tests; panel rendering/security checks; build and package validation.

**Acceptance criteria:** Partial and multi-function selections resolve predictably; invalid or oversized contexts are handled clearly; the panel works with keyboard navigation; no external network request is made.

**Explicitly out of scope:** Meaningful review findings, provider calls, persistent review history, and skill profiles.

**Status:** Planned.

### Phase 3 — Reliable local code checks

**Goal and user-visible outcome:** The review panel can show a small number of grounded local findings and strengths, each tied to a real source range.

**Features included:** A deliberately small set of high-confidence checks for languages with implemented adapters; a safe generic fallback for other languages; finding categories and evidence; confidence/provenance labels; deterministic local explanation templates; a useful empty-result response.

**Main implementation tasks:** Define a common finding schema and language-adapter interface; add a narrow set of high-confidence checks for the first practical adapters (JavaScript/TypeScript and Python are candidates); validate code ranges; prevent duplicate or low-value suggestions; distinguish bugs/risks from maintainability advice; provide positive and negative fixtures for each adapter. Keep the analyzer extensible and record coverage gaps rather than implying the initial adapters cover every language. The language-agnostic provider route is implemented in Phase 4, not this local-analysis phase.

**Important decisions / dependencies:** Keep checks conservative and explainable. Do not reproduce ESLint or TypeScript diagnostics wholesale. Existing compiler/linter diagnostics may be linked as context but should not be presented as DevLens discoveries without added teaching value. Every claim must point to evidence.

**Tests and verification Codex should run:** Positive, negative, and edge-case analyzer tests for each rule; range and evidence validation; fixtures with comments, generics, nested scopes, and TS syntax; full build and extension smoke test.

**Acceptance criteria:** Findings refer to valid ranges in the submitted code; repeated runs produce stable results; false positives are controlled by conservative rules; each card says what, why, and one way to improve; empty results avoid inventing praise or issues.

**Explicitly out of scope:** Personalization over time, a broad lint ruleset, automated fixes, exhaustive per-language adapter coverage, and claims of equal quality across all languages before evaluation.

**Status:** Planned.

### Phase 4 — AI explanations and structured feedback

**Goal and user-visible outcome:** When the user opts in, users can request language-agnostic review and level-adjusted teaching explanations for code in languages without a local adapter, while every suggestion remains tied to evidence in the submitted code. Local-only users retain the checks available from Phase 3.

**Features included:** Provider abstraction and one initial provider integration; explicit per-review disclosure/consent and persistent local-only setting; language ID included with bounded code context; configurable explanation depth/style; schema-validated summaries and explanations; graceful offline/provider failure behavior. Provider review is the initial path toward broad language coverage, not a guarantee of equal quality for every language.

**Main implementation tasks:** Choose provider and transport; define exactly which selection and findings are sent; minimize and bound context; use VS Code SecretStorage for a user-supplied key if needed; redact secrets where feasible; validate structured responses against local findings; show provider and data-sending status; ensure logs omit code, prompts, and credentials.

**Important decisions / dependencies:** Provider policy, supported endpoint, cost and rate limits must be documented before enabling calls. No silent uploads. A provider can explain or prioritize local findings but cannot introduce unsupported code claims. Local-only mode must retain Phase 3 functionality.

**Tests and verification Codex should run:** Mocked provider contract tests; malformed, oversized, delayed, offline, and error responses; consent/local-only tests asserting no network call; secret-handling and redaction checks; schema/range validation; build and extension-host verification.

**Acceptance criteria:** The user can tell before sending what leaves the computer and to whom; local-only mode works without credentials or network; users can request review for a language without a local adapter when the selected provider supports it; remote output is tied to submitted code evidence and validated; provider failure preserves local feedback; explanation preference changes teaching depth without labeling the developer.

**Explicitly out of scope:** DevLens-hosted inference, mandatory accounts, multi-provider marketplace, autonomous code edits, and training on user code.

**Status:** Planned.

### Phase 5 — Personalization and local review history

**Goal and user-visible outcome:** Users who opt in can revisit past reviews and tune which kinds of feedback DevLens emphasizes.

**Features included:** Local opt-in history; inspect, delete individual records, clear all, pause, and retention limit controls; simple focus preferences; recurring-pattern summaries based on tagged findings and examples.

**Main implementation tasks:** Define minimal stored data and retention; version and migrate records; separate settings from history; avoid storing source text by default (store finding metadata and user-approved snippets only if specifically justified); add controls and privacy documentation; let users mark a suggestion useful/not useful as local preference input.

**Important decisions / dependencies:** History should be off by default until the user enables it. Establish whether code snippets are ever stored; default to no snippets. Do not infer patterns from data the user did not choose to retain. No telemetry by default.

**Tests and verification Codex should run:** Storage opt-in/default-off tests; migration and retention tests; deletion/clear/pause behavior; verify no source text or secret leakage in stored records; verify history data remains local; extension tests and packaging.

**Acceptance criteria:** Users can understand and control stored data; recurring patterns show examples and counts with uncertainty; pausing and deleting work; settings and retained records do not include credentials or full source by default.

**Explicitly out of scope:** Cloud sync, account system, team analytics, social sharing, behavioral advertising, and automatic code edits.

**Status:** Planned.

### Phase 6 — Skill profile and progress view

**Goal and user-visible outcome:** Users can see a modest, evidence-linked view of areas they are practicing and how examples change over time.

**Features included:** Local profile by areas such as testing, readability, error handling, and architecture; examples behind each observation; trend summaries with sample counts; controls to hide, reset, or clear the view.

**Main implementation tasks:** Define category taxonomy and aggregation rules; require enough observations before showing a trend; use neutral labels and show supporting examples; avoid numeric grades and unsupported claims about ability; design a lightweight VS Code view or panel.

**Important decisions / dependencies:** Depends on Phase 5 opt-in records and trustworthy categorized findings. Profile wording should describe code patterns observed in reviewed samples, not the person. Decide minimum sample threshold and time window from beta feedback.

**Tests and verification Codex should run:** Aggregation tests with sparse, mixed, and deleted data; ensure no profile is shown without adequate opted-in examples; check wording and accessibility; regression tests and package validation.

**Acceptance criteria:** Every assessment can be traced to examples; low sample counts are clearly qualified; progress is descriptive rather than a score; reset/delete controls work; no profile data leaves the computer.

**Explicitly out of scope:** Career ranking, benchmarking users against others, public profiles, team dashboards, and gamified streak pressure.

**Status:** Planned.

### Phase 7 — Evaluation, privacy review, beta, and Marketplace release

**Goal and user-visible outcome:** A small group can install a reliable, clearly documented extension, and a verified release can be submitted to the VS Code Marketplace.

**Features included:** Evaluation set and quality review; privacy and security review; onboarding and settings copy; issue reporting guidance; beta build and feedback loop; accessibility and performance pass; Marketplace metadata, icon, changelog, and release checklist.

**Main implementation tasks:** Create representative anonymized fixtures; measure finding usefulness, evidence correctness, and false-positive rate; review network traffic and storage; document provider, permissions, limitations, and data handling; test clean install/update/uninstall; collect opt-in beta feedback; fix release-blocking defects; package and publish after the user approves the external release action.

**Important decisions / dependencies:** Marketplace publisher identity and credentials are external prerequisites. Do not commit publishing secrets. Define a support window and versioning policy. Publishing is a separate explicit action after the package and listing are reviewable.

**Tests and verification Codex should run:** Full unit and extension suite; lint/typecheck/build/package; supported VS Code version matrix; manual install smoke test; review privacy settings and network behavior; inspect packaged contents for secrets and unintended files; accessibility/performance checklist.

**Acceptance criteria:** Beta feedback has been triaged; release-blocking issues are resolved; quality claims match evaluation results; privacy disclosures match actual behavior; clean package installs and core flows pass; listing, version, and changelog are ready and verified.

**Explicitly out of scope:** Guaranteeing defect detection or identical quality for every language, exhaustive language-specific local adapters, team features, public launch marketing, and future cloud services not required for release.

**Status:** Planned.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Generic or incorrect AI advice undermines trust | Ground output in local findings; validate schemas and evidence; cap suggestions; include confidence/provenance; evaluate false positives. |
| Code is sent unexpectedly | Default to local-only; disclose provider and payload before first send and provide persistent opt-out; test that local-only causes no network requests. |
| Secrets or unrelated source enter prompts/logs | Bound context to selection; omit paths and unrelated files; minimize/redact; never log request content or credentials; inspect package and storage. |
| Too many weak findings feel like a linter | Keep the initial ruleset narrow; prioritize only actionable findings; allow dismiss/focus preferences; omit low-confidence claims. |
| Personalization appears judgmental or overconfident | Describe observed patterns in reviewed code; show examples and counts; qualify sparse evidence; avoid person-level grades. |
| Scope overwhelms a solo builder | Gate implementation by phase; target broad language reach through one consented provider path and incremental local adapters, not an exhaustive adapter matrix; no backend, account, or team features in MVP. |
| VS Code/Webview security or API changes | Use stable APIs, strict Content Security Policy, validated message handling, escaped content, extension-host tests, and documented engine range. |
| Provider cost, latency, or availability | Keep local findings useful; bound payload and response; support cancellation/timeouts; document provider limits and errors. |

## MVP definition of done

The MVP is done when a cleanly installable development build accepts code in any language VS Code opens as text and can review a selected function through **Review Selection**, shows a small number of specific evidence-linked suggestions in a VS Code panel, explains what each suggestion means and why it matters with one improvement path, respects the user's explanation preference, and has a useful local-only mode. Verified language adapters provide deterministic local checks for the languages they cover; an explicitly opted-in general review provider offers broader language reach for code without a local adapter. DevLens communicates limits by language and does not promise identical accuracy everywhere. Any optional external review clearly discloses the provider and data sent, requires user opt-in, keeps credentials in SecretStorage, and validates returned evidence against the submitted code. Core selection, analyzer, validation, privacy, and extension-host flows have automated coverage; build and packaging checks pass; setup and privacy behavior are documented.

## Overall release definition of done

The Marketplace release additionally passes the Phase 7 evaluation and privacy review, has a reviewed listing and changelog, installs cleanly, and accurately documents limitations and data handling. Marketplace publication itself requires explicit user approval once the release candidate is ready.
