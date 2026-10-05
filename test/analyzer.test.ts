import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCode } from '../src/analyzer';

test('reports direct eval as a conditional risk with exact evidence', () => {
	const code = 'const result = eval(userInput);';
	const result = analyzeCode('javascript', code);
	assert.equal(result.adapter, 'javascript-typescript');
	assert.equal(result.findings.length, 1);
	const finding = result.findings[0];
	assert.equal(finding.category, 'security');
	assert.equal(finding.kind, 'risk');
	assert.equal(finding.evidence.text, 'eval(userInput)');
	assert.equal(code.slice(finding.evidence.startOffset, finding.evidence.endOffset), finding.evidence.text);
	assert.match(finding.why, /depends on where/i);
});

test('reports an empty TypeScript catch block, but not a handled one', () => {
	const code = [
		'try { run(); } catch (error) { }',
		'try { run(); } catch (error) { recover(error); }'
	].join('\n');
	const result = analyzeCode('typescript', code);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].id, 'javascript.empty-catch');
	assert.equal(result.findings[0].evidence.startLine, 0);
	assert.equal(result.findings[0].evidence.endLine, 0);
	assert.match(result.findings[0].improve, /Handle the expected failure/);
});

test('recognizes explicit TypeScript function contracts as a source-linked strength', () => {
	const code = 'function add(left: number, right: number): number { return left + right; }';
	const result = analyzeCode('typescript', code);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].kind, 'strength');
	assert.equal(result.findings[0].category, 'readability');
	assert.equal(code.slice(result.findings[0].evidence.startOffset, result.findings[0].evidence.endOffset), result.findings[0].evidence.text);
});

test('ignores eval text inside strings and comments', () => {
	const code = [
		'const message = "eval(input)";',
		'// eval(input)',
		'function safe() { return message; }'
	].join('\n');
	assert.equal(analyzeCode('javascript', code).findings.length, 0);
});

test('supports TSX syntax and keeps findings in source order with a small cap', () => {
	const code = [
		'const View = () => <div />;',
		'eval(first);',
		'eval(second);',
		'eval(third);',
		'eval(fourth);'
	].join('\n');
	const result = analyzeCode('typescriptreact', code);
	assert.equal(result.findings.length, 3);
	assert.deepEqual(result.findings.map(item => item.evidence.startLine), [1, 2, 3]);
	for (const finding of result.findings) {
		assert.equal(code.slice(finding.evidence.startOffset, finding.evidence.endOffset), finding.evidence.text);
	}
});

test('repeated analysis is stable and unsupported languages receive no guessed findings', () => {
	const code = 'function run() { try { task(); } catch {} }';
	assert.deepEqual(analyzeCode('javascript', code), analyzeCode('javascript', code));
	const python = analyzeCode('python', 'try:\n    run()\nexcept Exception:\n    pass');
	assert.equal(python.adapter, 'generic');
	assert.deepEqual(python.findings, []);
});

test('returns a clean local-check result for code with no matching rule', () => {
	const result = analyzeCode('typescript', 'export function add(a, b) { return a + b; }');
	assert.equal(result.adapter, 'javascript-typescript');
	assert.deepEqual(result.findings, []);
});
