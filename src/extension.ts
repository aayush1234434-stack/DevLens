import * as vscode from 'vscode';
import { renderPanel, showReviewPanel } from './panel';
import { captureReviewContext, ReviewMode } from './reviewContext';

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('devlens.reviewCurrentFile', () => review('file')),
		vscode.commands.registerCommand('devlens.reviewSelection', () => review('selection')),
		vscode.commands.registerCommand('devlens.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:devlens.devlens')
		)
	);
}

async function review(mode: ReviewMode): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		showReviewPanel({ kind: 'error', message: 'Open a code or text file before starting a review.' });
		return;
	}

	const panel = showReviewPanel({ kind: 'loading', message: 'Preparing code for review…' });
	await new Promise<void>(resolve => setTimeout(resolve, 75));

	const result = captureReviewContext(editor.document, editor.selection, mode);
	if (!result.ok) {
		panel.title = 'DevLens Review · Needs attention';
		panel.webview.html = renderPanel({ kind: 'error', message: result.message });
		return;
	}

	panel.webview.html = renderPanel({ kind: 'ready', context: result.context });
}

export function deactivate(): void {}
