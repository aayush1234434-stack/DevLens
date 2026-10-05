# DevLens

DevLens is an early VS Code extension shell for thoughtful code review across programming languages.

## Run the extension

1. Open this folder in VS Code.
2. Run `npm install` once.
3. Press `F5` or choose **Run > Start Debugging**. VS Code compiles the extension and opens a second Extension Development Host window.
4. In that window, open a code file in any language VS Code recognizes and run **DevLens: Review Selection** or **DevLens: Review Current File** from the Command Palette.

DevLens captures and displays code locally; it does not analyze or upload source code yet. For JavaScript and TypeScript selections inside a function, it expands the review context to the smallest containing function. For other languages, and selections spanning multiple functions, it preserves exactly what you selected. Review input is capped at 50,000 characters and the panel discloses when it was shortened.

On the first review, DevLens offers an optional coaching profile: self-described experience, current/target role, a focus goal, and a “Current level” or “Stretch me” lens. The profile is stored locally and is not sent anywhere. Use **DevLens: Configure Coaching Profile**, **DevLens: Toggle Coaching Profile**, or **DevLens: Clear Coaching Profile** in the Command Palette to manage it. These preferences are coaching context, not an assessment of your ability. Empty selections/files show a clear error state.

## Settings

Run **DevLens: Open Settings** or open VS Code Settings and search for `@ext:devlens.devlens` to choose explanation depth and style. Manage your coaching profile from the Command Palette using the commands above.

## Verify

- `npm run compile` — compile the extension and tests.
- `npm run test:unit` — verify function-aware capture, multi-language fallback, truncation, and profile normalization without launching VS Code.
- `VSCODE_EXECUTABLE_PATH="/path/to/Code" npm test` — run extension-host tests using an installed VS Code build. If the variable is omitted, the test runner downloads a stable VS Code build.

On macOS, the command-line executable path is commonly `/Applications/Visual Studio Code.app/Contents/MacOS/Code`.
