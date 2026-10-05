import * as ts from 'typescript';

export type ReviewMode = 'selection' | 'file';
export type ReviewScope = 'selection' | 'function' | 'file';

export interface TextSelection {
	start: { line: number; character: number };
	end: { line: number; character: number };
}

export interface ReviewDocument {
	languageId: string;
	lineCount: number;
	uri: { path: string };
	getText(range?: TextSelection): string;
	offsetAt(position: { line: number; character: number }): number;
}

export interface ReviewContext {
	mode: ReviewMode;
	scope: ReviewScope;
	code: string;
	fileName: string;
	languageId: string;
	startLine: number;
	endLine: number;
	truncated: boolean;
}

export type ReviewContextResult =
	| { ok: true; context: ReviewContext }
	| { ok: false; message: string };

export const maximumReviewCharacters = 50_000;
const maximumSourceForAst = 1_000_000;

const scriptKinds: Record<string, ts.ScriptKind> = {
	javascript: ts.ScriptKind.JS,
	javascriptreact: ts.ScriptKind.JSX,
	typescript: ts.ScriptKind.TS,
	typescriptreact: ts.ScriptKind.TSX
};

export function captureReviewContext(
	document: ReviewDocument,
	selection: TextSelection,
	mode: ReviewMode
): ReviewContextResult {
	let rawCode: string;
	let startLine: number;
	let endLine: number;
	let scope: ReviewScope;

	if (mode === 'file') {
		rawCode = document.getText();
		startLine = 0;
		endLine = Math.max(0, document.lineCount - 1);
		scope = 'file';
	} else {
		const source = document.getText();
		let startOffset = clamp(document.offsetAt(selection.start), 0, source.length);
		let endOffset = clamp(document.offsetAt(selection.end), startOffset, source.length);
		scope = 'selection';

		const functionRange = endOffset > startOffset
			? findContainingFunction(document, source, startOffset, endOffset)
			: undefined;
		if (functionRange) {
			startOffset = functionRange.start;
			endOffset = functionRange.end;
			scope = 'function';
		}

		rawCode = source.slice(startOffset, endOffset);
		startLine = lineAtOffset(source, startOffset);
		endLine = lineAtOffset(source, Math.max(startOffset, endOffset - 1));
	}

	if (rawCode.trim().length === 0) {
		return {
			ok: false,
			message: mode === 'selection'
				? 'Select some code to review.'
				: 'This file is empty, so there is no code to review.'
		};
	}

	const truncated = rawCode.length > maximumReviewCharacters;
	const code = truncated ? truncateAtLineBoundary(rawCode, maximumReviewCharacters) : rawCode;
	if (truncated) {
		endLine = startLine + Math.max(0, code.split('\n').length - 1);
	}

	return {
		ok: true,
		context: {
			mode,
			scope,
			code,
			fileName: document.uri.path.split('/').pop() || 'Untitled',
			languageId: document.languageId,
			startLine,
			endLine,
			truncated
		}
	};
}

function findContainingFunction(
	document: ReviewDocument,
	source: string,
	selectionStart: number,
	selectionEnd: number
): { start: number; end: number } | undefined {
	const scriptKind = scriptKinds[document.languageId];
	if (scriptKind === undefined || source.length > maximumSourceForAst) return undefined;

	const sourceFile = ts.createSourceFile(
		document.uri.path || 'review.ts',
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind
	);
	let smallest: { start: number; end: number } | undefined;

	const visit = (node: ts.Node): void => {
		if (ts.isFunctionLike(node) && 'body' in node && node.body) {
			const start = node.getStart(sourceFile);
			const end = node.end;
			if (start <= selectionStart && selectionEnd <= end && (!smallest || end - start < smallest.end - smallest.start)) {
				smallest = { start, end };
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return smallest;
}

function truncateAtLineBoundary(value: string, maximumCharacters: number): string {
	const newline = value.lastIndexOf('\n', maximumCharacters);
	if (newline <= 0) return value.slice(0, maximumCharacters);
	const end = value.charCodeAt(newline - 1) === 13 ? newline - 1 : newline;
	return value.slice(0, end);
}

function lineAtOffset(source: string, offset: number): number {
	let line = 0;
	for (let index = 0; index < offset; index += 1) {
		if (source.charCodeAt(index) === 10) line += 1;
	}
	return line;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
