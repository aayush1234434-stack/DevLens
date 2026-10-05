import * as assert from 'assert';
import * as vscode from 'vscode';
import { analyzeCode } from '../../src/analyzer';
import { CoachingProfile, defaultCoachingProfile } from '../../src/coachingProfile';
import { renderPanel } from '../../src/panel';
import { captureReviewContext, ReviewContext } from '../../src/reviewContext';

suite('DevLens extension shell', () => {
	test('activates and contributes both review commands', async () => {
		const extension = vscode.extensions.getExtension('devlens.devlens');
		assert.ok(extension, 'DevLens extension should be discoverable');
		await extension.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('devlens.reviewCurrentFile'));
		assert.ok(commands.includes('devlens.reviewSelection'));
		assert.ok(commands.includes('devlens.openSettings'));
		assert.ok(commands.includes('devlens.configureCoachingProfile'));
		assert.ok(commands.includes('devlens.toggleCoachingProfile'));
		assert.ok(commands.includes('devlens.clearCoachingProfile'));
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

	test('renders coaching context accessibly and escapes profile text', () => {
		const context: ReviewContext = {
			mode: 'selection',
			scope: 'function',
			code: 'function safe() {}',
			fileName: 'safe.ts',
			languageId: 'typescript',
			startLine: 0,
			endLine: 0,
			truncated: false
		};
		const profile: CoachingProfile = {
			...defaultCoachingProfile,
			experienceLevel: 'senior',
			targetRole: '<script>alert(1)</script>',
			reviewLens: 'stretch'
		};
		const html = renderPanel({ kind: 'ready', context, analysis: analyzeCode('typescript', context.code), coachingProfile: profile, profileEnabled: true });
		assert.match(html, /aria-labelledby="coaching-heading"/);
		assert.match(html, /Stretch me/);
		assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
		assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
	});

	test('renders local evidence, explanation, provenance, and escaped source safely', () => {
		const code = 'eval("<unsafe>");';
		const context: ReviewContext = {
			mode: 'selection', scope: 'selection', code, fileName: 'unsafe.js', languageId: 'javascript',
			startLine: 4, endLine: 4, truncated: false
		};
		const html = renderPanel({
			kind: 'ready', context, analysis: analyzeCode('javascript', code),
			coachingProfile: defaultCoachingProfile, profileEnabled: false
		});
		assert.match(html, /Review this eval call/);
		assert.match(html, /Why it matters:/);
		assert.match(html, /One way to improve:/);
		assert.match(html, /High confidence · Local check/);
		assert.match(html, /line 5/);
		assert.match(html, /&lt;unsafe&gt;/);
		assert.doesNotMatch(html, /<unsafe>/);
	});

	test('expands a partial JavaScript selection to its function and keeps Python exact', async () => {
		const jsDoc = await vscode.workspace.openTextDocument({
			language: 'javascript',
			content: 'function calculate(value) {\n  return value + 1;\n}'
		});
		const jsResult = captureReviewContext(
			jsDoc,
			new vscode.Selection(new vscode.Position(1, 5), new vscode.Position(1, 17)),
			'selection'
		);
		assert.strictEqual(jsResult.ok, true);
		if (jsResult.ok) {
			assert.strictEqual(jsResult.context.scope, 'function');
			assert.strictEqual(jsResult.context.code, 'function calculate(value) {\n  return value + 1;\n}');
		}

		const pyDoc = await vscode.workspace.openTextDocument({ language: 'python', content: 'def greet():\n    return "hi"' });
		const pyResult = captureReviewContext(
			pyDoc,
			new vscode.Selection(new vscode.Position(1, 4), new vscode.Position(1, 15)),
			'selection'
		);
		assert.strictEqual(pyResult.ok, true);
		if (pyResult.ok) {
			assert.strictEqual(pyResult.context.scope, 'selection');
			assert.strictEqual(pyResult.context.code, 'return "hi"');
		}
	});

	test('handles empty selection and empty file safely', async () => {
		const emptySelectionDoc = await vscode.workspace.openTextDocument({ language: 'typescript', content: 'const x = 1;' });
		const emptySelection = captureReviewContext(emptySelectionDoc, new vscode.Selection(0, 0, 0, 0), 'selection');
		assert.strictEqual(emptySelection.ok, false);

		const emptyFileDoc = await vscode.workspace.openTextDocument({ language: 'javascript', content: '' });
		const emptyFile = captureReviewContext(emptyFileDoc, new vscode.Selection(0, 0, 0, 0), 'file');
		assert.strictEqual(emptyFile.ok, false);
		if (!emptyFile.ok) assert.match(emptyFile.message, /empty/i);

		const pythonDoc = await vscode.workspace.openTextDocument({ language: 'python', content: 'def greet(name):\n    return f"hello {name}"' });
		const python = captureReviewContext(pythonDoc, new vscode.Selection(0, 0, 0, 0), 'file');
		assert.strictEqual(python.ok, true);
		if (python.ok) assert.strictEqual(python.context.languageId, 'python');
	});

	test('review command opens its panel for an arbitrary language and empty files safely', async () => {
		const hasReviewPanel = () => vscode.window.tabGroups.all
			.flatMap(group => group.tabs)
			.some(tab => tab.label.startsWith('DevLens Review'));
		const emptyDocument = await vscode.workspace.openTextDocument({ language: 'typescript', content: '' });
		await vscode.window.showTextDocument(emptyDocument);
		await vscode.commands.executeCommand('devlens.reviewCurrentFile');
		assert.ok(hasReviewPanel(), 'Review Current File should open the DevLens panel');

		const pythonDocument = await vscode.workspace.openTextDocument({ language: 'python', content: 'print("hello")' });
		await vscode.window.showTextDocument(pythonDocument);
		await vscode.commands.executeCommand('devlens.reviewCurrentFile');
		assert.ok(hasReviewPanel(), 'Review Current File should open the panel for Python');
	});
});
