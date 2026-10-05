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

Use **DevLens: Toggle OpenAI Reviews** again to turn remote reviews off, or **DevLens: Remove OpenAI API Key** to remove the stored credential. Local checks continue to work when remote review is disabled, unavailable, cancelled, or fails. Provider feedback is schema-validated, shown as OpenAI-assisted, and accepted only when its quoted evidence is an exact, unique excerpt of the reviewed code. **Why this?** explains prioritization; **Not applicable** hides an observation for the current panel only and does not save it.

## Settings

Run **DevLens: Open Settings** or open VS Code Settings and search for `@ext:devlens.devlens` to choose explanation depth/style, allow per-review OpenAI consent prompts, and change the OpenAI API model. Manage your coaching profile and OpenAI key from the Command Palette using the commands above.

## Verify

- `npm run compile` — compile the extension and tests.
- `npm run test:unit` — verify function-aware capture, local checks, feedback validation, mocked OpenAI requests, consent gating, and profile normalization without launching VS Code or sending code externally.
- `VSCODE_EXECUTABLE_PATH="/path/to/Code" npm test` — run extension-host tests using an installed VS Code build. If the variable is omitted, the test runner downloads a stable VS Code build.

On macOS, the command-line executable path is commonly `/Applications/Visual Studio Code.app/Contents/MacOS/Code`.
