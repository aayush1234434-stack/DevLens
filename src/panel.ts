import * as vscode from 'vscode';
import { ReviewContext } from './reviewContext';

export type PanelState =
	| { kind: 'loading'; message: string }
	| { kind: 'error'; message: string }
	| { kind: 'ready'; context: ReviewContext };

export function showReviewPanel(state: PanelState): vscode.WebviewPanel {
	const panel = vscode.window.createWebviewPanel(
		'devlens.review',
		'DevLens Review',
		vscode.ViewColumn.Beside,
		{ enableScripts: false, retainContextWhenHidden: false }
	);
	panel.webview.html = renderPanel(state);
	return panel;
}

export function renderPanel(state: PanelState): string {
	const body = state.kind === 'loading'
		? `<p class="status" role="status">${escapeHtml(state.message)}</p>`
		: state.kind === 'error'
			? `<p class="status error" role="alert">${escapeHtml(state.message)}</p>`
			: `<p class="status" role="status">Code captured locally. Review analysis will be added in a later phase.</p>
<p class="meta">${escapeHtml(state.context.fileName)} · ${state.context.mode === 'selection' ? 'Selected lines' : 'Current file'} ${state.context.startLine + 1}–${state.context.endLine + 1}</p>
<pre><code>${escapeHtml(state.context.code)}</code></pre>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DevLens Review</title>
<style>
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 0 1rem 1rem; }
h1 { font-size: 1.25rem; font-weight: 600; }
.status { padding: .75rem; border-left: 3px solid var(--vscode-textLink-foreground); background: var(--vscode-textBlockQuote-background); }
.error { border-color: var(--vscode-errorForeground); }
.meta { color: var(--vscode-descriptionForeground); font-size: .9rem; }
pre { overflow: auto; padding: 1rem; background: var(--vscode-textCodeBlock-background); }
code { font-family: var(--vscode-editor-font-family); white-space: pre; }
</style>
</head>
<body>
<h1>DevLens Review</h1>
${body}
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
