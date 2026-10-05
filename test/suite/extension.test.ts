import * as assert from 'assert';
import * as vscode from 'vscode';
import { captureReviewContext } from '../../src/reviewContext';

suite('DevLens extension shell', () => {
	test('activates and contributes both review commands', async () => {
		const extension = vscode.extensions.getExtension('devlens.devlens');
		assert.ok(extension, 'DevLens extension should be discoverable');
		await extension.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('devlens.reviewCurrentFile'));
		assert.ok(commands.includes('devlens.reviewSelection'));
		assert.ok(commands.includes('devlens.openSettings'));
	});

	test('captures exactly the selected source and range', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'typescript',
			content: 'const first = 1;\nfunction chosen() {\n  return first;\n}\nconst last = 2;'
		});
		const selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(3, 1));
		const result = captureReviewContext(document, selection, 'selection');

		assert.strictEqual(result.ok, true);
		if (result.ok) {
			assert.strictEqual(result.context.code, 'function chosen() {\n  return first;\n}');
			assert.strictEqual(result.context.startLine, 1);
			assert.strictEqual(result.context.endLine, 3);
			assert.match(result.context.fileName, /^Untitled-/);
		}
	});

	test('handles empty selection, empty file, and unsupported file safely', async () => {
		const emptySelectionDoc = await vscode.workspace.openTextDocument({ language: 'typescript', content: 'const x = 1;' });
		const emptySelection = captureReviewContext(emptySelectionDoc, new vscode.Selection(0, 0, 0, 0), 'selection');
		assert.strictEqual(emptySelection.ok, false);

		const emptyFileDoc = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const emptyFile = captureReviewContext(emptyFileDoc, new vscode.Selection(0, 0, 0, 0), 'file');
		assert.strictEqual(emptyFile.ok, false);
		if (!emptyFile.ok) assert.match(emptyFile.message, /empty/i);

		const unsupportedDoc = await vscode.workspace.openTextDocument({ language: 'json', content: '{"safe": true}' });
		const unsupported = captureReviewContext(unsupportedDoc, new vscode.Selection(0, 0, 0, 0), 'file');
		assert.strictEqual(unsupported.ok, false);
		if (!unsupported.ok) assert.match(unsupported.message, /supports JavaScript and TypeScript/i);
	});

	test('review commands open their panel without throwing for empty and unsupported documents', async () => {
		const hasReviewPanel = () => vscode.window.tabGroups.all
			.flatMap(group => group.tabs)
			.some(tab => tab.label.startsWith('DevLens Review'));
		const emptyDocument = await vscode.workspace.openTextDocument({ language: 'typescript', content: '' });
		await vscode.window.showTextDocument(emptyDocument);
		await vscode.commands.executeCommand('devlens.reviewCurrentFile');
		assert.ok(hasReviewPanel(), 'Review Current File should open the DevLens panel');

		const unsupportedDocument = await vscode.workspace.openTextDocument({ language: 'json', content: '{"safe": true}' });
		await vscode.window.showTextDocument(unsupportedDocument);
		await vscode.commands.executeCommand('devlens.reviewSelection');
	});
});
