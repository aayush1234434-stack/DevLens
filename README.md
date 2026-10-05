# DevLens

DevLens is an early VS Code extension shell for thoughtful JavaScript and TypeScript code review.

## Run the extension

1. Open this folder in VS Code.
2. Run `npm install` once.
3. Press `F5` or choose **Run > Start Debugging**. VS Code compiles the extension and opens a second Extension Development Host window.
4. In that window, open a JavaScript or TypeScript file and run **DevLens: Review Selection** or **DevLens: Review Current File** from the Command Palette.

The current shell captures the selected code locally and displays it in a DevLens panel. It does not analyze or upload source code yet. Empty selections/files and unsupported languages show a clear error state.

## Settings

Run **DevLens: Open Settings** or open VS Code Settings and search for `@ext:devlens.devlens`. You can choose explanation depth and style; these preferences will be used by later review phases.

## Verify

- `npm run compile` — compile the extension and tests.
- `npm run test:unit` — verify selection capture and safe handling of empty/unsupported inputs without launching VS Code.
- `VSCODE_EXECUTABLE_PATH="/path/to/Code" npm test` — run extension-host tests using an installed VS Code build. If the variable is omitted, the test runner downloads a stable VS Code build.

On macOS, the command-line executable path is commonly `/Applications/Visual Studio Code.app/Contents/MacOS/Code`.
