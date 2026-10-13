# DevLens

DevLens is a VS Code extension for evidence-grounded code feedback, with optional user-approved AI mentoring.

## Run the extension

1. Open this folder in VS Code.
2. Run `npm install` once.
3. Press `F5` or choose **Run > Start Debugging**. VS Code compiles the extension and opens a second Extension Development Host window.
4. In that window, open a code file in any language VS Code recognizes and run **DevLens: Review Selection** or **DevLens: Review Current File** from the Command Palette.

DevLens always runs its current deterministic checks locally first. JavaScript and TypeScript currently have narrow AST checks; other languages, including Python, are accepted but receive no guessed local findings until a verified adapter is added. For JavaScript and TypeScript selections inside a function, it expands the review context to the smallest containing function. For other languages, and selections spanning multiple functions, it preserves exactly what you selected. Review input is capped at 50,000 characters and the panel discloses when it was shortened.

On the first review, DevLens offers an optional coaching profile: self-described experience, current/target role, a focus goal, and a “Current level” or “Stretch me” lens. The profile is stored locally. These preferences are coaching context, not an assessment of your ability. Empty selections/files show a clear error state.

## Optional OpenAI mentor review

Remote reviews are disabled by default. To enable them, run **DevLens: Set OpenAI API Key** and **DevLens: Toggle OpenAI Reviews**. The API key is stored in VS Code SecretStorage. Enabling remote reviews only allows DevLens to ask: before every request, a modal identifies OpenAI, the selected source text and language, explanation settings, and the exact non-empty coaching profile fields that will be sent. Nothing is uploaded unless you choose **Send this review to OpenAI**. The file name, workspace path, other files, and review history are not included. Each request may incur charges from your OpenAI API account.

Use **DevLens: Toggle OpenAI Reviews** again to turn remote reviews off, or **DevLens: Remove OpenAI API Key** to remove the stored credential. Local checks continue to work when remote review is disabled, unavailable, cancelled, or fails. Provider feedback is schema-validated, shown as OpenAI-assisted, and accepted only when its quoted evidence is an exact, unique excerpt of the reviewed code. **Why this?** explains prioritization. **Not applicable** hides a card from the current panel; when mentor memory is active, it also saves that feedback locally.

## Optional mentor memory

Mentor memory is off by default. Run **DevLens: Manage Mentor Memory** to enable it. The extension then keeps at most 25 local review records by default. You can change the limit from 1 to 100, pause or turn memory off, inspect and delete an individual record, clear all records, or reset your focus and feedback. Lowering the retention limit deletes older records immediately. A review record contains only its date, VS Code language ID, broad finding tags, and any feedback you gave. It contains no source code, excerpts, filenames, file paths, profile text, or API keys. DevLens does not send this memory to OpenAI or register it for VS Code Settings Sync.

On a review card, **Helpful**, **Not helpful**, and **Not applicable** save feedback when memory is active. **Focus on this** and **Show me less** set a visible preference for that card's category. These choices adjust the order of later local findings and provider cards; they do not change a skill rating or suppress a correctness concern. Pausing memory stops both recording and reordering. Recurring themes appear only after the same tag appears in at least two retained reviews for the current goal. Each theme shows its count and recent date/language examples; provider themes are intentionally broad categories, not claims that the exact same issue repeated.

Use **My goal changed** in the memory menu, or edit your coaching profile goal, to start a fresh focus context. Earlier records remain inspectable but no longer influence current ordering or recurring-theme summaries. You can correct feedback on a card, reset all current-goal focus and feedback, or delete records to remove their influence.

## Evidence-based skill profile

Run **DevLens: Open Skill Profile**, or choose **Open skill profile** in a review panel. The profile is calculated locally from retained mentor-memory records for your current goal. It appears after at least three retained reviews have usable tagged observations. Areas with evidence show strengths and opportunities separately, with counts and date/language examples; **Inspect saved review** opens the corresponding metadata record. DevLens stores no source snippets for these examples, so it cannot reopen the original code. Advice you marked **Not helpful** or **Not applicable** is excluded from the profile.

With at least four reviews containing observations, areas seen in two or more reviews show earlier and recent observation counts. A tag missing from a later review does not prove improvement: review scope, language coverage, and the selected code may differ. Areas without evidence are left unassessed. Familiar words in your stated goal can highlight possibly related areas, but this is only a navigation hint. The profile does not grade your ability or judge role readiness.

The panel lets you **Hide profile**, **Start a new profile baseline** without deleting history, **Include earlier retained reviews** again, or **Delete current-goal review records** after confirmation. That last action also removes those records from mentor memory; records from earlier goals remain. Pausing or turning off memory stops new recording, while previously retained examples remain inspectable. Nothing from the profile is sent to OpenAI or synced by DevLens.

## Settings

Run **DevLens: Open Settings** or open VS Code Settings and search for `@ext:devlens.devlens` to choose explanation depth/style, allow per-review OpenAI consent prompts, and change the OpenAI API model. Manage your coaching profile, mentor memory, and OpenAI key from the Command Palette using the commands above.

## Verify

- `npm run compile` — compile the extension and tests.
- `npm run test:unit` — verify function-aware capture, local checks, feedback validation, mocked OpenAI requests, consent gating, coaching-profile normalization, mentor-memory controls, and local skill-profile aggregation/rendering without launching VS Code or sending code externally.
- `VSCODE_EXECUTABLE_PATH="/path/to/Code" npm test` — run extension-host tests using an installed VS Code build. If the variable is omitted, the test runner downloads a stable VS Code build.

On macOS, the command-line executable path is commonly `/Applications/Visual Studio Code.app/Contents/MacOS/Code`.
