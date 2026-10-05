export type ReviewMode = 'selection' | 'file';

export interface TextSelection {
	start: { line: number; character: number };
	end: { line: number; character: number };
}

export interface ReviewDocument {
	languageId: string;
	lineCount: number;
	uri: { path: string };
	getText(range?: TextSelection): string;
}

export interface ReviewContext {
	mode: ReviewMode;
	code: string;
	fileName: string;
	languageId: string;
	startLine: number;
	endLine: number;
}

export type ReviewContextResult =
	| { ok: true; context: ReviewContext }
	| { ok: false; message: string };

const maximumReviewCharacters = 50_000;

export function captureReviewContext(
	document: ReviewDocument,
	selection: TextSelection,
	mode: ReviewMode
): ReviewContextResult {
	const code = mode === 'selection' ? document.getText(selection) : document.getText();
	if (code.trim().length === 0) {
		return {
			ok: false,
			message: mode === 'selection'
				? 'Select some code to review.'
				: 'This file is empty, so there is no code to review.'
		};
	}

	if (code.length > maximumReviewCharacters) {
		return { ok: false, message: 'This review is too large. Select a smaller section and try again.' };
	}

	const startLine = mode === 'selection' ? selection.start.line : 0;
	const endLine = mode === 'selection'
		? Math.max(selection.start.line, selection.end.line - (selection.end.character === 0 ? 1 : 0))
		: Math.max(0, document.lineCount - 1);

	return {
		ok: true,
		context: {
			mode,
			code,
			fileName: document.uri.path.split('/').pop() || 'Untitled',
			languageId: document.languageId,
			startLine,
			endLine
		}
	};
}
