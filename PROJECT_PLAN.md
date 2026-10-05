# DevLens Project Plan

## Product definition

DevLens is a VS Code extension that helps an individual developer become better through code review, not merely ship a patch faster. Its signature experience is a private, user-controlled mentor loop: **review → understand → practice → revisit**. DevLens notices patterns in code the user chose to review, explains one useful concept at the user's preferred depth, gives a small practice action, and later shows evidence of what changed. Its memory is about learning preferences and tagged patterns—not a hidden dossier of source code.

The review itself should still be useful on day one: select a function or file, see what is working, and get a few specific suggestions with evidence, rationale, and one improvement path. DevLens aims to accept code in any language VS Code opens as text, while being honest that local checks and provider quality vary by language.

**Product wedge:** optimize for individual learning and continuity, rather than team PR throughput, generic issue volume, or one-shot AI chat. On first use, ask the developer to self-describe their current experience, current or target role, and near-term improvement goal. Tailor explanation depth and which trade-offs are emphasized to that chosen context. A distinctive review should answer: “What did I do well?”, “What is the most useful thing to learn from this code for my goal?”, and—when the user has opted into memory—“Have I encountered this pattern before, and what changed?”

This is a positioning hypothesis, not a claim that no competitor offers mentoring. Compete through deliberate, user-invoked reviews, explicit goal-aware rationale, evidence behind every observation, and transparent local learning history—not always-on monitoring or a feature checklist. Validate that developers actually find goal-aware feedback more useful than a generic review before expanding the product.

DevLens is a learning aid, not a judge, compiler, security scanner, or replacement for code review. It should distinguish evidence-backed correctness concerns from maintainability advice and subjective preferences. An experience level describes the user's preferred teaching depth; it is not an assessment of their ability.

### Initial users

- Individual developers learning or working in any programming language supported as text by VS Code.
- Developers who want useful explanations while working in VS Code, without setting up a team platform or account.
- Users who may prefer local-only analysis or may opt in to sending review context to an AI provider for richer explanations.

### First useful experience (MVP)

The user sets (or skips) a short, editable profile: self-described experience level, current/target role, and one improvement goal. They select a function, run **DevLens: Review Selection**, and receive a short list of specific suggestions in a VS Code panel. Each suggestion includes relevant code evidence, what could improve, why it matters to the selected goal, and one practical improvement. The explanation depth follows the user's preference; DevLens does not infer their actual professional level from code. It accepts any code language VS Code exposes as text, while analysis depth depends on verified local adapters and provider capability. Optional AI review requires clear disclosure before code is sent.

### Product principles

1. Tie every suggestion to evidence in the reviewed code. Avoid generic advice that could fit any file.
2. Separate likely defects and concrete risks from maintainability recommendations and style preferences.
3. Keep feedback concise, kind, and actionable; include strengths where the code supports them.
4. Treat experience level as a teaching preference, not a personal rating.
5. Explain when review content leaves the computer, what is sent, and which provider receives it. Never upload silently.
6. Offer a local-only mode. Do not require an account or backend for the MVP.
7. Keep keys out of source code, settings files, and logs. Use VS Code SecretStorage for any user-provided credentials.
8. Make review history and pattern tracking understandable, inspectable, and controllable by the user.
9. Adapt to explicit user choices and feedback, not opaque judgments of ability. Every progress observation must link back to examples and show its sample size.

## Scope and assumptions

### MVP scope

- VS Code desktop extension that accepts code in any language VS Code opens as a text document.
- Review selected code, with function-aware selection as the primary flow; support reviewing the current file as a secondary flow.
- A Webview panel for structured feedback, initially limited to a few high-value suggestions.
- Language-aware local parsing and deterministic checks, added incrementally where reliable analyzers are available; preserve selected-code capture for other languages.
- Optional AI explanation provider behind an interface, with explicit user choice and a local-only setting.
- User preferences for explanation depth / experience level and concise versus more explanatory feedback.
- A small, skippable, editable personalization profile: self-described current experience, current/target role, and one active growth goal. Share only the fields needed to tailor a review, and only with an external provider when the user has consented.
- Per-review rationale that connects an evidence-backed suggestion to the user's chosen goal; never claim a person is or is not qualified for a role.
- Local review history, only after an explicit product choice and with controls to pause, inspect, and clear it.
- No account, hosted service, telemetry by default, team workspace, or social feature. Universal language coverage is a product goal; per-language analysis quality must be evaluated before claims are made.

### Working assumptions to validate before the first personalized-review milestone

- Start with a TypeScript-based VS Code extension using the stable VS Code Extension API and the standard extension test harness available at implementation time.
- Use a Webview panel for rich review cards rather than relying only on diagnostics. Diagnostics may later represent narrowly scoped, high-confidence findings.
- Carry VS Code's language ID with every review input. Use the TypeScript compiler API for TypeScript/JavaScript syntax and source locations, and add focused adapters for other languages incrementally. Keep checks small and explainable; do not build a general-purpose linter.
- Offer useful local checks without requiring AI. An optional AI provider may broaden language coverage and tailor explanations, but output must be evidence-checked and clearly labeled; it is not a source of fabricated locations or certainty.
- Do not build a DevLens server for the MVP. A provider adapter may call a documented endpoint only after consent. Choose the first provider during Phase 4 based on setup friction, cost, privacy, supported languages, and structured-output reliability.
- Let users skip or edit experience, role, and goal setup at any time. Treat these as context supplied for coaching, not verified credentials or a capability assessment.
- Store preferences and any opted-in history in VS Code global/workspace storage as appropriate. Default history to off until its retention and data model are reviewed in Phase 5.
- Prefer supported VS Code APIs and a minimal dependency set; pin and audit dependencies as the extension matures.
- Use the cloned `DevLens/` repository as the project root. It was empty when this plan was written.

## Proposed architecture

Keep modules small and separated so review evidence does not depend on an AI provider:

- **Extension host**: registers commands, reads editor/selection state, gathers explanation preferences and the user-authored coaching profile, coordinates reviews, and owns storage and secrets.
- **Source adapter**: accepts text documents, carries the VS Code language ID, determines selection/function boundaries when an adapter is available, and builds a bounded review input with source locations.
- **Language adapters and local analysis**: run syntax-aware, deterministic checks where a verified language adapter exists; return typed findings with evidence, confidence, category, and source range. Other languages retain exact selection capture and can use the opted-in general review provider.
- **Review provider interface**: optional provider receives bounded code plus only the user-approved profile fields needed for this review, and returns schema-constrained explanations tied to code evidence. Validate all output; reject unsupported claims, invalid evidence/ranges, or malformed responses.
- **Feedback model**: shared, versioned schema for strengths, suggestions, evidence, rationale, actionable example, category, severity/confidence, and provenance (local or provider-assisted).
- **Webview**: renders escaped, accessible feedback cards; applies a strict Content Security Policy and communicates through validated messages.
- **Preferences and history**: separate user settings from review records. History is opt-in, local, bounded, and clearable. Skill summaries derive from tagged examples and are labeled as indicative, never as definitive ratings.

Data flow: editor selection + selected coaching lens → bounded source context → local findings → optional, consented provider review with minimum relevant goal/profile context → evidence/schema validation → panel. The extension should not send workspace paths, unrelated file contents, full profile data, or secrets. Provider failures should leave local findings available and explain what failed without logging code, personal profile details, or credentials.

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

### Phase 2 — Function-aware review setup and coaching profile

**Goal and user-visible outcome:** Users can review the intended code unit and tell DevLens what kind of coaching they want. The setup stays short, editable, and skippable.

**Features included:** AST-based function-boundary detection for JavaScript/TypeScript; explicit fallback behavior for other languages; predictable handling of selections spanning functions; review size limits and truncation disclosure; cancellation/progress behavior; accessible panel refinements; onboarding/settings for self-described experience level, current/target role, active improvement goal, and explanation depth; a “current-level” versus “stretch me” review lens.

**Main implementation tasks:** Use TypeScript AST for function and source boundaries; define and test multiple-function selection behavior; cap review context and disclose truncation; design a short, skippable profile flow with examples and custom values; persist preferences locally; expose an easy way to edit, clear, or temporarily ignore profile context; improve keyboard navigation and panel lifecycle.

**Important decisions / dependencies:** Depend on Phase 1 command and panel shell. Prefer TypeScript AST boundaries over fragile brace matching. The “level” is chosen by the user and controls teaching depth, never an inferred ability rating. Other-language function selection should use a verified adapter or preserve the exact selection rather than guessing with brace heuristics. Keep profile local; never send code or profile externally in this phase.

**Tests and verification Codex should run:** Unit tests for empty, partial, full-function, multiple-function, comment/string brace, and file selections; tests for profile skip/edit/reset and current-level/stretch lens; confirm changing profile does not alter captured code; extension-host command tests; panel rendering/security checks; build and package validation.

**Acceptance criteria:** Partial and multi-function selections resolve predictably where supported; invalid or oversized contexts are handled clearly; a user can skip setup and later edit/clear the profile; current-level and stretch lenses are distinguishable; the panel works with keyboard navigation; no external network request is made.

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

### Phase 4 — Evidence-grounded mentor review

**Goal and user-visible outcome:** A user can request a thoughtful, language-agnostic review tailored to their self-described experience, current/target role, and active goal. The result feels like a careful mentor rather than a generic linter: a grounded strength when supported, a few prioritized suggestions, why each matters to the chosen goal, and one concept or improvement path to take away.

**Features included:** Provider abstraction and one initial provider integration; explicit per-review disclosure/consent and persistent local-only setting; language ID included with bounded code context; relevant, user-approved coaching profile fields; configurable explanation depth/style; structured strengths and suggestions; evidence excerpts/ranges; concise rationale including “why this matters to your goal”; one improvement path; schema-validated output; graceful offline/provider failure behavior. Include a “why this?” explanation and a way to mark advice as not applicable. Provider review is the initial path toward broad language reach, not a guarantee of equal quality for every language.

**Main implementation tasks:** Choose provider and transport; define exactly which selection and minimum profile fields are sent; minimize and bound context; use VS Code SecretStorage for a user-supplied key if needed; redact secrets where feasible; design a versioned review schema; validate evidence/ranges against submitted code and local findings; suppress duplicate/generic advice; prioritize no more than a few useful cards; show provider and data-sending status; ensure logs omit code, prompts, profile details, and credentials. Add paired fixture evaluations comparing generic reviews with level-, role-, and goal-tailored reviews across supported languages.

**Important decisions / dependencies:** Provider policy, supported endpoint, cost and rate limits must be documented before enabling calls. No silent uploads. A provider may surface a code-specific concern without a local adapter, but each claim needs a verifiable excerpt or location and must be presented with uncertainty; do not manufacture exact diagnostics. Local-only mode must retain Phase 3 functionality. Do not make auto-fix the center of this product.

**Tests and verification Codex should run:** Mocked provider contract tests; fixture/eval cases for genericness, evidence validity, duplicates, unsupported claims, and level/style adaptation; malformed, oversized, delayed, offline, and error responses; consent/local-only tests asserting no network call; secret-handling and redaction checks; schema/range validation; build and extension-host verification.

**Acceptance criteria:** Before sending, the user can tell what code and profile fields leave the computer and to whom; local-only mode works without credentials or network; users can request review for a language without a local adapter when the selected provider supports it; suggestions point to relevant code evidence, explain relevance to the chosen goal, and give one actionable next step; tailored reviews differ meaningfully in teaching depth or trade-off emphasis without inventing concerns or labeling the developer; unsupported/generic output is rejected or clearly qualified; provider failure preserves local feedback.

**Explicitly out of scope:** DevLens-hosted inference, mandatory accounts, multi-provider marketplace, autonomous code edits, and training on user code.

**Status:** Planned.

### Phase 5 — User-controlled mentor memory

**Goal and user-visible outcome:** Users who opt in can shape what DevLens emphasizes relative to their stated goal. It remembers lightweight learning preferences, chosen focus areas, and recurring tagged themes so the next review can be more relevant, without silently retaining their code.

**Features included:** Local opt-in history; inspect, delete individual records, clear all, pause, and retention limit controls; “focus on this” and “show me less of this” controls; helpful/not-helpful/not-applicable feedback; recurring-pattern summaries based on tagged findings and examples; visible controls to correct or reset inferred focus; a “goal changed” action to update context without treating past preferences as permanent.

**Main implementation tasks:** Define minimal stored data and retention; version and migrate records; separate settings from history; derive adaptation only from explicit feedback and opted-in review records; avoid storing source text by default (store finding metadata and user-approved snippets only if specifically justified); add inspect/pause/delete/export controls as appropriate; explain exactly how feedback changes future reviews; add privacy documentation.

**Important decisions / dependencies:** History and adaptive memory are off by default until enabled. Establish whether code snippets are ever stored; default to no snippets. Do not infer patterns from data the user did not choose to retain. User feedback may tune topic selection and teaching style, but must not silently change an ability score or decide role readiness. No telemetry by default.

**Tests and verification Codex should run:** Storage opt-in/default-off tests; migration and retention tests; deletion/clear/pause/reset behavior; test that explicit feedback updates only documented preferences; verify no source text or secret leakage in stored records; verify history data remains local; extension tests and packaging.

**Acceptance criteria:** Users can explain how memory affects a future review; recurring patterns show examples and counts with uncertainty; users can correct, pause, inspect, and delete memory; settings and retained records do not include credentials or full source by default.

**Explicitly out of scope:** Cloud sync, account system, team analytics, social sharing, behavioral advertising, and automatic code edits.

**Status:** Planned.

### Phase 6 — Evidence-based skill profile

**Goal and user-visible outcome:** Users can see which code patterns they are practicing toward their chosen goal and whether reviewed examples show change over time, without receiving a gamified or person-level grade.

**Features included:** Local profile by areas such as testing, readability, error handling, and architecture; optional mapping between a user's chosen goal and relevant practice areas (never a job-readiness verdict); separate “strengths observed” and “opportunities practiced”; examples behind each observation; trend summaries with sample counts and uncertainty; controls to hide, reset, or clear the view; profile generated only from opted-in, retained examples.

**Main implementation tasks:** Define a small language-neutral category taxonomy with adapter-specific mappings; define aggregation and minimum-sample rules; distinguish repeated findings from improvement evidence; use neutral labels and show supporting examples; avoid numeric grades and unsupported claims about ability; design a lightweight VS Code view or panel that points to underlying reviews.

**Important decisions / dependencies:** Depends on Phase 5 opt-in records and trustworthy categorized findings. Profile wording should describe code patterns observed in reviewed samples, not the person. Decide minimum sample threshold and time window from beta feedback.

**Tests and verification Codex should run:** Aggregation tests with sparse, mixed, and deleted data; ensure no profile is shown without adequate opted-in examples; check wording and accessibility; regression tests and package validation.

**Acceptance criteria:** Every assessment can be traced to examples; low sample counts are clearly qualified; profile describes reviewed code patterns rather than judging the person; reset/delete controls work; no profile data leaves the computer.

**Explicitly out of scope:** Career ranking, benchmarking users against others, public profiles, team dashboards, and gamified streak pressure.

**Status:** Planned.

### Phase 7 — Practice loop and revisit experience

**Goal and user-visible outcome:** DevLens closes the loop between advice and learning: a user can turn one goal-relevant review insight into a small practice goal and revisit the concept in later code.

**Features included:** Optional “practice this” action from a grounded, goal-relevant suggestion; a tiny local practice queue (one to three active concepts); a short, generated exercise or self-check adjusted to the user's chosen explanation depth; “review again” comparison that shows whether the same tagged pattern appears in later opted-in reviews; actions to mark practiced, not relevant, or completed.

**Main implementation tasks:** Design non-judgmental practice prompts tied to a finding category; separate practice notes from source history; define safe comparison rules and confidence thresholds; prevent a later absence of evidence from being represented as proof of mastery; connect practice queue, review history, and skill profile with explicit user controls.

**Important decisions / dependencies:** Depends on trustworthy tagged feedback, Phase 5 opt-in memory, and Phase 6 evidence thresholds. Keep the practice queue intentionally small; do not add streaks, points, leaderboards, or mandatory notifications. Generate exercises from concepts, not private source code, unless the user explicitly chooses otherwise.

**Tests and verification Codex should run:** Practice lifecycle and deletion tests; deterministic comparison tests for repeated, absent, and conflicting evidence; verify no mastery claim from one review or missing evidence; ensure practice actions work when history is paused; accessibility and keyboard-flow checks.

**Acceptance criteria:** A user can turn a suggestion into a manageable practice action; later reviews can connect to the same theme with visible evidence; the user can dismiss, complete, pause, and delete practice items; no score, streak pressure, or unsupported mastery claim is shown.

**Explicitly out of scope:** Full curriculum or course platform, quizzes requiring a server, streak mechanics, peer competition, coaching notifications, and automatic source-code edits.

**Status:** Planned.

### Phase 8 — Evaluation, privacy review, beta, and Marketplace release

**Goal and user-visible outcome:** A small group can install a reliable, clearly documented extension, and a verified release can be submitted to the VS Code Marketplace.

**Features included:** Evaluation set and quality review; privacy and security review; onboarding and settings copy; issue reporting guidance; beta build and feedback loop; accessibility and performance pass; Marketplace metadata, icon, changelog, and release checklist.

**Main implementation tasks:** Create representative anonymized fixtures across languages, experience levels, roles, and goals; compare generic review output with goal-aware output; measure evidence correctness, false-positive rate, genericness, usefulness, and whether the selected goal/depth changes feedback appropriately; review network traffic and profile/history storage; document provider, permissions, limitations, and data handling; test clean install/update/uninstall; collect opt-in beta feedback on whether users feel understood and return to practice (not just issue detection); fix release-blocking defects; package and publish after the user approves the external release action.

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
| Role/level labels imply unsupported career judgments | Let users self-describe and edit/skip context; use it only to tune feedback; never report that a user is or is not ready for a job based on reviewed snippets. |
| Personalization is just prompt decoration | Evaluate paired generic vs. tailored cases; require a specific, evidence-backed explanation of how the chosen goal changes prioritization or teaching depth. |
| Scope overwhelms a solo builder | Gate implementation by phase; target broad language reach through one consented provider path and incremental local adapters, not an exhaustive adapter matrix; no backend, account, or team features in MVP. |
| VS Code/Webview security or API changes | Use stable APIs, strict Content Security Policy, validated message handling, escaped content, extension-host tests, and documented engine range. |
| Provider cost, latency, or availability | Keep local findings useful; bound payload and response; support cancellation/timeouts; document provider limits and errors. |

## MVP definition of done

The MVP is done when a cleanly installable development build accepts code in any language VS Code opens as text; offers a short, skippable profile for self-described experience, role, and one active goal; and reviews a selected function through **Review Selection**. The panel shows a few specific evidence-linked suggestions and any justified strengths the code supports; explains why a priority matters to the user's chosen goal; gives one practical improvement; and respects the selected explanation depth. A narrow first version of the “review → understand → practice → revisit” loop lets a user save one insight as an optional local practice goal and revisit it, without claiming mastery. Verified language adapters provide deterministic local checks for the languages they cover; an explicitly opted-in general review provider offers broader language reach for code without a local adapter. DevLens communicates limits by language and does not promise identical accuracy everywhere. Any optional external review clearly discloses the provider and exact profile/code context sent, requires user opt-in, keeps credentials in SecretStorage, and validates returned evidence against the submitted code. Core selection, analyzer, validation, privacy, personalization, and extension-host flows have automated coverage; build and packaging checks pass; setup and privacy behavior are documented.

## Overall release definition of done

The Marketplace release additionally passes the Phase 8 evaluation and privacy review, has a reviewed listing and changelog, installs cleanly, and accurately documents limitations and data handling. Marketplace publication itself requires explicit user approval once the release candidate is ready.
