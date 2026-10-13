import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCode } from '../src/analyzer';
import { normalizeCoachingProfile } from '../src/coachingProfile';
import { buildMentorPrompt, validateMentorReview } from '../src/mentorReview';

/** Synthetic snippets only. These are coverage fixtures, not production accuracy estimates. */
const localCases: { id: string; language: string; code: string; expected: string[] }[] = [
	{ id: 'js-eval', language: 'javascript', code: 'const result = eval(userInput);', expected: ['javascript.eval-call'] },
	{ id: 'js-eval-string', language: 'javascript', code: 'const note = "eval(userInput)";', expected: [] },
	{ id: 'js-shadowed-eval', language: 'javascript', code: 'const eval = value => value; eval(userInput);', expected: [] },
	{ id: 'js-empty-catch', language: 'javascript', code: 'try { run(); } catch (error) {}', expected: ['javascript.empty-catch'] },
	{ id: 'js-handled-catch', language: 'javascript', code: 'try { run(); } catch (error) { recover(error); }', expected: [] },
	{ id: 'ts-contract', language: 'typescript', code: 'function add(a: number, b: number): number { return a + b; }', expected: ['typescript.explicit-contract'] },
	{ id: 'ts-inferred', language: 'typescript', code: 'function add(a, b) { return a + b; }', expected: [] },
	{ id: 'tsx-eval', language: 'typescriptreact', code: 'const View = () => <div />; eval(value);', expected: ['javascript.eval-call'] },
	{ id: 'jsx-clean', language: 'javascriptreact', code: 'const View = () => <main>Hello</main>;', expected: [] },
	{ id: 'python-fallback', language: 'python', code: 'try:\n    work()\nexcept Exception:\n    pass', expected: [] },
	{ id: 'cpp-fallback', language: 'cpp', code: 'int add(int a, int b) { return a + b; }', expected: [] },
	{ id: 'java-fallback', language: 'java', code: 'int add(int a, int b) { return a + b; }', expected: [] }
];

test('release fixtures have exact expected local findings and valid source evidence', () => {
	let falsePositiveCount = 0;
	let missedExpectedCount = 0;
	for (const fixture of localCases) {
		const result = analyzeCode(fixture.language, fixture.code);
		const actual = result.findings.map(finding => finding.id);
		falsePositiveCount += actual.filter(id => !fixture.expected.includes(id)).length;
		missedExpectedCount += fixture.expected.filter(id => !actual.includes(id)).length;
		assert.deepEqual(actual, fixture.expected, fixture.id);
		for (const finding of result.findings) {
			assert.equal(fixture.code.slice(finding.evidence.startOffset, finding.evidence.endOffset), finding.evidence.text, fixture.id);
		}
		if (['python', 'cpp', 'java'].includes(fixture.language)) assert.equal(result.adapter, 'generic', fixture.id);
	}
	assert.equal(falsePositiveCount, 0);
	assert.equal(missedExpectedCount, 0);
});

test('paired generic and tailored prompts preserve code while adding only chosen coaching context', () => {
	const profiles = [
		{ experienceLevel: 'beginner', currentRole: 'Student', targetRole: 'Frontend developer', improvementGoal: 'testing', reviewLens: 'currentLevel' },
		{ experienceLevel: 'midLevel', currentRole: 'Backend developer', targetRole: 'Senior developer', improvementGoal: 'error handling', reviewLens: 'stretch' },
		{ experienceLevel: 'senior', currentRole: 'Platform engineer', targetRole: 'Architect', improvementGoal: 'architecture', reviewLens: 'stretch' },
		{ experienceLevel: 'unspecified', currentRole: '', targetRole: '', improvementGoal: 'readability', reviewLens: 'currentLevel' }
	];
	for (const raw of profiles) {
		const profile = normalizeCoachingProfile(raw);
		const base = { languageId: 'python', code: 'def total(values):\n    return sum(values)',
			explanationLevel: profile.experienceLevel === 'beginner' ? 'beginner' : 'advanced', explanationStyle: 'concise' };
		const generic = JSON.parse(buildMentorPrompt(base).input) as Record<string, unknown>;
		const tailored = JSON.parse(buildMentorPrompt({ ...base, profile }).input) as Record<string, unknown>;
		assert.equal(generic.sourceCode, tailored.sourceCode);
		assert.equal(generic.languageId, tailored.languageId);
		assert.equal(generic.coachingPreferences, undefined);
		assert.equal((tailored.coachingPreferences as Record<string, string>).improvementGoal, profile.improvementGoal);
		assert.doesNotMatch(JSON.stringify(tailored), /fileName|workspacePath|apiKey/i);
	}
});

test('provider fixture accepts only an exact excerpt, not a plausible invented example', () => {
	const code = 'def total(values):\n    return sum(values)';
	const raw = {
		formatVersion: 1, strengths: [], suggestions: [{
			category: 'testing', title: 'Check the empty collection case', evidence: 'return sum(values)',
			what: 'An empty collection is an important boundary to consider.', whyItMatters: 'A test can document the intended result.',
			whyThis: 'The return expression is the entire calculation.', action: 'Write an empty-input test.', confidence: 'medium'
		}], takeaway: ''
	};
	const accepted = validateMentorReview(raw, code, analyzeCode('python', code));
	assert.equal(accepted.suggestions.length, 1);
	const rejected = validateMentorReview({ ...raw, suggestions: [{ ...raw.suggestions[0], evidence: 'return values[0]' }] }, code, analyzeCode('python', code));
	assert.equal(rejected.suggestions.length, 0);
});
