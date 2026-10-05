import * as ts from 'typescript';

export type FindingCategory = 'security' | 'error-handling' | 'readability';
export type FindingKind = 'risk' | 'maintainability' | 'strength';

export interface SourceEvidence {
	startOffset: number;
	endOffset: number;
	startLine: number;
	endLine: number;
	text: string;
}

export interface LocalFinding {
	id: string;
	title: string;
	category: FindingCategory;
	kind: FindingKind;
	confidence: 'high';
	provenance: 'local';
	evidence: SourceEvidence;
	what: string;
	why: string;
	improve: string;
}

export interface AnalysisResult {
	adapter: 'javascript-typescript' | 'generic';
	findings: LocalFinding[];
}

interface LanguageAdapter {
	languageIds: readonly string[];
	analyze(code: string, languageId: string): LocalFinding[];
}

const maxFindings = 3;
const scriptKinds: Record<string, ts.ScriptKind> = {
	javascript: ts.ScriptKind.JS,
	javascriptreact: ts.ScriptKind.JSX,
	typescript: ts.ScriptKind.TS,
	typescriptreact: ts.ScriptKind.TSX
};

const jsTsAdapter: LanguageAdapter = {
	languageIds: Object.keys(scriptKinds),
	analyze: analyzeJavaScriptOrTypeScript
};

const adapters: readonly LanguageAdapter[] = [jsTsAdapter];

/** Deterministic local checks. Unsupported languages deliberately receive no guessed findings. */
export function analyzeCode(languageId: string, code: string): AnalysisResult {
	const adapter = adapters.find(candidate => candidate.languageIds.includes(languageId));
	if (!adapter || code.trim().length === 0) {
		return { adapter: 'generic', findings: [] };
	}

	const findings = adapter.analyze(code, languageId)
		.filter(finding => isValidFinding(code, finding))
		.filter((finding, index, all) => all.findIndex(other => other.id === finding.id &&
			other.evidence.startOffset === finding.evidence.startOffset) === index)
		.sort((left, right) => left.evidence.startOffset - right.evidence.startOffset)
		.slice(0, maxFindings);

	return { adapter: 'javascript-typescript', findings };
}

function analyzeJavaScriptOrTypeScript(code: string, languageId: string): LocalFinding[] {
	const scriptKind = scriptKinds[languageId];
	const sourceFile = ts.createSourceFile('review.ts', code, ts.ScriptTarget.Latest, true, scriptKind);
	const findings: LocalFinding[] = [];

	const visit = (node: ts.Node): void => {
		if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) &&
			'body' in node && node.body &&
			(node.type !== undefined || node.parameters.some(parameter => parameter.type !== undefined))) {
			findings.push(createFinding(
				'typescript.explicit-contract', 'The function makes its type contract explicit', 'readability', 'strength', code,
				node.getStart(sourceFile), node.body.getStart(sourceFile),
				'This function declares parameter or return types instead of leaving the contract implicit.',
				'Explicit types make expected inputs and outputs easier to understand at the call site and help catch incompatible changes during development.',
				'Keep these types aligned with runtime validation whenever values cross an untrusted boundary.'
			));
		}

		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
			findings.push(createFinding(
				'javascript.eval-call', 'Review this eval call', 'security', 'risk', code,
				node.expression.getStart(sourceFile), node.end,
				'This call evaluates a string as code. If that string can include untrusted input, it can execute code the developer did not intend.',
				'Whether this is a vulnerability depends on where the evaluated string comes from; DevLens cannot determine that from this call alone.',
				'Prefer an explicit operation or parser. If eval is intentional, ensure the input is trusted and tightly controlled.'
			));
		}

		if (ts.isCatchClause(node) && node.block.statements.length === 0) {
			findings.push(createFinding(
				'javascript.empty-catch', 'This catch block discards the error', 'error-handling', 'maintainability', code,
				node.getStart(sourceFile), node.end,
				'The catch block is empty, so the error is ignored and execution continues without an explicit recovery or explanation.',
				'Silenced failures can make broken state difficult to detect and diagnose. This may be intentional for a specific error, so consider the surrounding behavior.',
				'Handle the expected failure, add a meaningful fallback, or document why ignoring this particular error is safe.'
			));
		}

		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return findings;
}

function createFinding(
	id: string,
	title: string,
	category: FindingCategory,
	kind: FindingKind,
	code: string,
	startOffset: number,
	endOffset: number,
	what: string,
	why: string,
	improve: string
): LocalFinding {
	const start = lineAtOffset(code, startOffset);
	const end = lineAtOffset(code, Math.max(startOffset, endOffset - 1));
	return {
		id, title, category, kind, confidence: 'high', provenance: 'local',
		evidence: { startOffset, endOffset, startLine: start, endLine: end, text: code.slice(startOffset, endOffset) },
		what, why, improve
	};
}

function isValidFinding(code: string, finding: LocalFinding): boolean {
	const evidence = finding.evidence;
	return Number.isInteger(evidence.startOffset) && Number.isInteger(evidence.endOffset) &&
		evidence.startOffset >= 0 && evidence.endOffset > evidence.startOffset &&
		evidence.endOffset <= code.length &&
		evidence.text === code.slice(evidence.startOffset, evidence.endOffset) &&
		evidence.startLine === lineAtOffset(code, evidence.startOffset) &&
		evidence.endLine === lineAtOffset(code, evidence.endOffset - 1);
}

function lineAtOffset(source: string, offset: number): number {
	let line = 0;
	for (let index = 0; index < offset; index += 1) {
		if (source.charCodeAt(index) === 10) line += 1;
	}
	return line;
}
