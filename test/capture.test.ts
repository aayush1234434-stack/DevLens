import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureReviewContext, ReviewDocument, TextSelection } from '../src/reviewContext';

function document(languageId: string, content: string, filePath = '/workspace/example.ts'): ReviewDocument {
	const lines = content.split('\n');
	return {
		languageId,
		lineCount: content.length === 0 ? 1 : lines.length,
		uri: { path: filePath },
		getText(range?: TextSelection): string {
			if (!range) return content;
			if (range.start.line === range.end.line && range.start.character === range.end.character) return '';
			return lines.slice(range.start.line, range.end.line + 1)
				.map((line, index, selectionLines) => {
					const first = index === 0 ? line.slice(range.start.character) : line;
					return index === selectionLines.length - 1 ? first.slice(0, range.end.character) : first;
				})
				.join('\n');
		},
		offsetAt(position): number {
			return lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.character;
		}
	};
}

function selectionFor(source: string, selectedText: string): TextSelection {
	const start = source.indexOf(selectedText);
	assert.notEqual(start, -1, `Expected fixture text: ${selectedText}`);
	const end = start + selectedText.length;
	const positionAt = (offset: number) => {
		const before = source.slice(0, offset).split('\n');
		return { line: before.length - 1, character: before.at(-1)?.length ?? 0 };
	};
	return { start: positionAt(start), end: positionAt(end) };
}

test('captures the exact selected code and line range', () => {
	const source = 'const first = 1;\nfunction chosen() {\n  return first;\n}\nconst last = 2;';
	const selection: TextSelection = { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } };
	const result = captureReviewContext(document('typescript', source), selection, 'selection');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.context.code, 'function chosen() {\n  return first;\n}');
	assert.equal(result.context.startLine, 1);
	assert.equal(result.context.endLine, 3);
	assert.equal(result.context.fileName, 'example.ts');
	assert.equal(result.context.languageId, 'typescript');
});

test('captures the complete current file', () => {
	const source = 'export function total(a: number, b: number) {\n  return a + b;\n}';
	const result = captureReviewContext(
		document('typescript', source),
		{ start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
		'file'
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.context.code, source);
	assert.equal(result.context.mode, 'file');
	assert.equal(result.context.startLine, 0);
	assert.equal(result.context.endLine, 2);
});

test('rejects empty selection and empty file with useful messages', () => {
	const emptySelection = captureReviewContext(
		document('typescript', 'function chosen() { return 1; }'),
		{ start: { line: 0, character: 20 }, end: { line: 0, character: 20 } },
		'selection'
	);
	assert.equal(emptySelection.ok, false);
	if (!emptySelection.ok) assert.match(emptySelection.message, /select some/i);

	const emptyFile = captureReviewContext(
		document('javascript', ''),
		{ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
		'file'
	);
	assert.equal(emptyFile.ok, false);
	if (!emptyFile.ok) assert.match(emptyFile.message, /file is empty/i);
});

test('captures code from different language IDs and rejects oversized review context', () => {
	const selection: TextSelection = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } };
	for (const [languageId, filePath, source] of [
		['python', '/workspace/app.py', 'x = 1'],
		['cpp', '/workspace/main.cpp', 'int main() { return 0; }'],
		['rust', '/workspace/main.rs', 'fn main() {}']
	]) {
		const result = captureReviewContext(document(languageId, source, filePath), selection, 'file');
		assert.equal(result.ok, true, `${languageId} should be accepted`);
		if (result.ok) {
			assert.equal(result.context.languageId, languageId);
			assert.equal(result.context.fileName, filePath.split('/').pop());
		}
	}

	const oversizedSource = 'x'.repeat(50_000) + '\nextra line';
	const oversized = captureReviewContext(document('plaintext', oversizedSource), selection, 'file');
	assert.equal(oversized.ok, true);
	if (oversized.ok) {
		assert.equal(oversized.context.truncated, true);
		assert.equal(oversized.context.code.length, 50_000);
		assert.equal(oversized.context.scope, 'file');
	}
});

test('expands a partial TypeScript selection to the smallest containing function', () => {
	const source = [
		'function outer() {',
		'  function inner() {',
		'    return 42;',
		'  }',
		'  return inner();',
	'}'
	].join('\n');
	const result = captureReviewContext(document('typescript', source), selectionFor(source, 'return 42;'), 'selection');
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.context.scope, 'function');
		assert.equal(result.context.code, 'function inner() {\n    return 42;\n  }');
		assert.equal(result.context.startLine, 1);
		assert.equal(result.context.endLine, 3);
	}
});

test('keeps an exact selection that spans multiple functions', () => {
	const source = 'function first() { return 1; }\nfunction second() { return 2; }';
	const selection: TextSelection = {
		start: { line: 0, character: 0 },
		end: { line: 1, character: source.split('\n')[1].length }
	};
	const result = captureReviewContext(document('typescript', source), selection, 'selection');
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.context.scope, 'selection');
		assert.equal(result.context.code, source);
	}
});

test('preserves exact selection for languages without a verified function adapter', () => {
	const source = 'def calculate(value):\n    return value + 1';
	const result = captureReviewContext(document('python', source, '/workspace/calc.py'), selectionFor(source, 'return value + 1'), 'selection');
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.context.scope, 'selection');
		assert.equal(result.context.code, 'return value + 1');
		assert.equal(result.context.languageId, 'python');
	}
});

test('AST function boundaries ignore braces in comments and strings', () => {
	const source = [
		'function render() {',
		'  const marker = "}";',
		'  /* This brace is not a function boundary: } */',
		'  return marker;',
		'}'
	].join('\n');
	const result = captureReviewContext(document('javascript', source), selectionFor(source, 'return marker;'), 'selection');
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.context.scope, 'function');
		assert.equal(result.context.code, source);
	}
});
