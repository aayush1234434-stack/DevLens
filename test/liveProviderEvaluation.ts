import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { analyzeCode } from '../src/analyzer';
import { CoachingProfile, normalizeCoachingProfile } from '../src/coachingProfile';
import { validateMentorReview } from '../src/mentorReview';
import { OpenAIResponsesProvider } from '../src/openAiProvider';

/**
 * Opt-in live check for the release evaluation. Sends only the synthetic snippets
 * below to OpenAI. Run from a terminal where OPENAI_API_KEY is already set.
 * Do not paste the key into chat, logs, or this repository.
 *
 * This records evidence acceptance and latency. It does not assign the human
 * scorecard in EVALUATION.md.
 */

interface LiveCase {
	id: string;
	languageId: string;
	code: string;
	kind: 'straightforward' | 'ambiguous' | 'no-action';
	profile: CoachingProfile;
}

function profile(experienceLevel: CoachingProfile['experienceLevel'], currentRole: string, targetRole: string, improvementGoal: string, reviewLens: CoachingProfile['reviewLens']): CoachingProfile {
	return normalizeCoachingProfile({ experienceLevel, currentRole, targetRole, improvementGoal, reviewLens });
}

const beginnerTesting = profile('beginner', 'Student', 'Frontend developer', 'testing', 'currentLevel');
const midErrorHandling = profile('midLevel', 'Backend developer', 'Senior developer', 'error handling', 'stretch');
const seniorArchitecture = profile('senior', 'Platform engineer', 'Architect', 'architecture', 'stretch');

const cases: LiveCase[] = [
	caseOf('js-eval', 'javascript', 'straightforward', 'const result = eval(userInput);', beginnerTesting),
	caseOf('js-empty-catch', 'javascript', 'ambiguous', 'try { run(); } catch (error) {}', midErrorHandling),
	caseOf('js-clean', 'javascript', 'no-action', 'function add(left, right) {\n  return left + right;\n}', seniorArchitecture),
	caseOf('ts-contract', 'typescript', 'straightforward', 'function add(a: number, b: number): number { return a + b; }', beginnerTesting),
	caseOf('ts-untyped', 'typescript', 'ambiguous', 'function add(a, b) { return a + b; }', midErrorHandling),
	caseOf('ts-clean', 'typescript', 'no-action', 'export function ready(value: string): boolean {\n  return value.trim().length > 0;\n}', seniorArchitecture),
	caseOf('py-bare-except', 'python', 'straightforward', 'try:\n    work()\nexcept Exception:\n    pass', beginnerTesting),
	caseOf('py-mutable-default', 'python', 'ambiguous', 'def collect(item, bucket=[]):\n    bucket.append(item)\n    return bucket', midErrorHandling),
	caseOf('py-clean', 'python', 'no-action', 'def total(values):\n    return sum(values)', seniorArchitecture),
	caseOf('cpp-unchecked', 'cpp', 'straightforward', 'int read(int* value) {\n  return *value;\n}', beginnerTesting),
	caseOf('cpp-ownership', 'cpp', 'ambiguous', 'struct Node { Node* next; };\nNode* make() { return new Node(); }', midErrorHandling),
	caseOf('cpp-clean', 'cpp', 'no-action', 'int add(int a, int b) { return a + b; }', seniorArchitecture)
];

function caseOf(id: string, languageId: string, kind: LiveCase['kind'], code: string, coaching: CoachingProfile): LiveCase {
	return { id, languageId, code, kind, profile: coaching };
}

async function main(): Promise<void> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error('Set OPENAI_API_KEY in this terminal, then rerun npm run evaluate:live. Do not paste the key into chat.');
		process.exitCode = 2;
		return;
	}

	const provider = new OpenAIResponsesProvider();
	const rows = [];
	for (const item of cases) {
		const local = analyzeCode(item.languageId, item.code);
		const genericStarted = Date.now();
		const generic = await oneReview(provider, apiKey, item, local, false);
		const tailoredStarted = Date.now();
		const tailored = await oneReview(provider, apiKey, item, local, true);
		rows.push({
			id: item.id,
			languageId: item.languageId,
			kind: item.kind,
			goal: item.profile.improvementGoal,
			genericMs: generic.milliseconds,
			tailoredMs: tailored.milliseconds,
			generic,
			tailored,
			orderCheck: genericStarted <= tailoredStarted
		});
		console.log(`${item.id}: generic ${generic.summary}; tailored ${tailored.summary}`);
	}

	const directory = join(__dirname, '../../.vscode-test');
	mkdirSync(directory, { recursive: true });
	const outputPath = join(directory, 'live-evaluation.json');
	writeFileSync(outputPath, JSON.stringify({
		ranAt: new Date().toISOString(),
		model: 'gpt-6-astra',
		note: 'Synthetic fixtures only. Human scores from EVALUATION.md are still required. This file must stay uncommitted.',
		rows
	}, null, 2));
	console.log(`Wrote ${rows.length} paired reviews to ${outputPath}`);
}

async function oneReview(
	provider: OpenAIResponsesProvider,
	apiKey: string,
	item: LiveCase,
	local: ReturnType<typeof analyzeCode>,
	tailored: boolean
): Promise<{ ok: boolean; milliseconds: number; accepted: number; summary: string; error?: string; review?: unknown }> {
	const started = Date.now();
	try {
		const raw = await provider.review({
			languageId: item.languageId,
			code: item.code,
			explanationLevel: item.profile.experienceLevel === 'beginner' ? 'beginner' : 'advanced',
			explanationStyle: 'concise',
			...(tailored ? { profile: item.profile } : {})
		}, apiKey);
		const review = validateMentorReview(raw, item.code, local);
		const accepted = review.strengths.length + review.suggestions.length;
		return { ok: true, milliseconds: Date.now() - started, accepted, summary: `${accepted} accepted`, review };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Live review failed.';
		return { ok: false, milliseconds: Date.now() - started, accepted: 0, summary: message, error: message };
	}
}

main().catch(error => {
	const message = error instanceof Error ? error.message : 'Live evaluation failed.';
	console.error(message);
	process.exitCode = 1;
});
