import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCode } from '../src/analyzer';
import { defaultMemorySettings, MemoryObservation, MemoryRecord, MemorySnapshot, MemoryStorage, MentorMemoryStore } from '../src/mentorMemory';
import { MentorReview } from '../src/mentorReview';
import { comparePractice, PracticeCandidate, PracticeItem, practiceCandidateFromReview, practicePrompt, PracticeStore } from '../src/practiceLoop';
import { renderPracticeHtml } from '../src/practiceView';

class TestStorage implements MemoryStorage {
	readonly values = new Map<string, unknown>();
	get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
	async update(key: string, value: unknown): Promise<void> { this.values.set(key, structuredClone(value)); }
}

const candidate: PracticeCandidate = {
	tag: 'local:javascript.empty-catch', category: 'error-handling',
	languageId: 'typescript', goalEpoch: 'goal-a', sourceRecordId: 'source-1'
};

function item(overrides: Partial<PracticeItem> = {}): PracticeItem {
	return {
		id: 'practice-1', ...candidate, createdAt: '2026-10-01T12:00:00.000Z', status: 'active', ...overrides
	};
}

function observation(id: string, tag: string, kind: MemoryObservation['kind'], feedback?: MemoryObservation['feedback']): MemoryObservation {
	return { id, tag, category: 'error-handling', kind, ...(feedback ? { feedback } : {}) };
}

function review(day: number, observations: MemoryObservation[], languageId = 'typescript', goalEpoch = 'goal-a'): MemoryRecord {
	return {
		id: `review-${day}`, createdAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`,
		languageId, goalEpoch, observations
	};
}

function snapshot(records: MemoryRecord[], enabled = true, paused = false): MemorySnapshot {
	return { settings: { ...defaultMemorySettings, enabled, paused, goalEpoch: 'goal-a' }, records, patterns: [] };
}

const tag = 'local:javascript.empty-catch';
const suggestion = (day: number) => review(day, [observation('local-0', tag, 'suggestion')]);
const strength = (day: number) => review(day, [observation('openai-strength-0', 'provider:error-handling:strength', 'strength')]);

test('only grounded suggestion cards can become practice candidates', () => {
	const analysis = analyzeCode('typescript', 'function f(value: string): string { try { return value; } catch (error) {} }');
	const suggestionIndex = analysis.findings.findIndex(finding => finding.id === 'javascript.empty-catch');
	assert.ok(suggestionIndex >= 0);
	const selected = practiceCandidateFromReview(analysis, undefined, `local-${suggestionIndex}`, 'typescript', 'goal-a');
	assert.equal(selected?.candidate.tag, tag);
	const positiveIndex = analysis.findings.findIndex(finding => finding.kind === 'strength');
	assert.ok(positiveIndex >= 0);
	assert.equal(practiceCandidateFromReview(analysis, undefined, `local-${positiveIndex}`, 'typescript', 'goal-a'), undefined);
	assert.equal(practiceCandidateFromReview(analysis, undefined, 'local-999', 'typescript', 'goal-a'), undefined);
	const provider: MentorReview = {
		formatVersion: 1, strengths: [], takeaway: '', suggestions: [{
			id: 'openai-suggestion-0', kind: 'suggestion', category: 'testing', title: 'Test this edge case',
			evidence: { startOffset: 0, endOffset: 4, startLine: 0, endLine: 0, text: 'test' },
			what: 'An edge case is untested.', whyItMatters: 'It can regress.', whyThis: 'The case is visible.',
			action: 'Add a focused test.', confidence: 'medium', provenance: 'openai-assisted'
		}]
	};
	assert.equal(practiceCandidateFromReview(analysis, provider, 'openai-suggestion-0', 'typescript', 'goal-a')?.candidate.tag,
		'provider:testing:suggestion');
	assert.equal(practiceCandidateFromReview(analysis, { ...provider, strengths: [{ ...provider.suggestions[0],
		id: 'openai-strength-0', kind: 'strength' }] }, 'openai-strength-0', 'typescript', 'goal-a'), undefined);
});

test('practice lifecycle enforces three open cards and supports pause, practiced, completion, dismissal and deletion', async () => {
	const storage = new TestStorage();
	const store = new PracticeStore(storage);
	assert.deepEqual(store.snapshot(), []);
	assert.equal(await store.add(candidate), 'added');
	assert.equal(await store.add(candidate), 'existing');
	const first = store.snapshot()[0];
	assert.equal(await store.add({ ...candidate, tag: 'local:javascript.eval-call', category: 'security' }), 'added');
	assert.equal(await store.add({ ...candidate, tag: 'provider:testing:suggestion', category: 'testing' }), 'added');
	assert.equal(await store.add({ ...candidate, tag: 'provider:readability:suggestion', category: 'readability' }), 'full');
	await store.markPracticed(first.id);
	assert.ok(store.snapshot()[0].lastPracticedAt);
	await store.setStatus(first.id, 'paused');
	assert.equal(store.snapshot()[0].status, 'paused');
	await store.markPracticed(first.id);
	await store.setStatus(first.id, 'active');
	assert.equal(store.snapshot()[0].status, 'active');
	await store.setStatus(first.id, 'completed');
	assert.equal(await store.add({ ...candidate, tag: 'provider:readability:suggestion', category: 'readability' }), 'added');
	await store.setStatus(first.id, 'active');
	assert.equal(store.snapshot()[0].status, 'completed', 'completed cards cannot silently reopen');
	const second = store.snapshot()[1];
	await store.setStatus(second.id, 'notRelevant');
	assert.equal(store.snapshot()[1].status, 'notRelevant');
	await store.delete(first.id);
	assert.ok(store.snapshot().every(saved => saved.id !== first.id));
	await store.clear();
	assert.deepEqual(store.snapshot(), []);
	assert.equal(await store.add({ ...candidate, tag: 'local:javascript.eval-call', category: 'testing' }), 'invalid');
});

test('practice notes stay separate from mentor memory and work while review history is paused', async () => {
	const storage = new TestStorage();
	const memory = new MentorMemoryStore(storage);
	const practice = new PracticeStore(storage);
	await memory.enable();
	await memory.togglePause();
	assert.equal(await practice.add({ ...candidate, sourceRecordId: undefined }), 'added');
	const saved = practice.snapshot()[0];
	await practice.markPracticed(saved.id);
	assert.ok(practice.snapshot()[0].lastPracticedAt);
	assert.deepEqual(memory.snapshot().records, []);
	const raw = JSON.stringify(storage.values.get('devlens.practiceQueue.records'));
	assert.doesNotMatch(raw, /sourceCode|evidence|filename|goal text|API key/i);
	assert.match(renderPracticeHtml(practice.snapshot(), memory.snapshot(), 'beginner', 'nonce'), /Mentor memory is paused/);
});

test('stored practice records are allowlisted and the bounded archive never silently drops cards', async () => {
	const storage = new TestStorage();
	storage.values.set('devlens.practiceQueue.records', { version: 99, records: [item()] });
	const store = new PracticeStore(storage);
	assert.deepEqual(store.snapshot(), []);
	storage.values.set('devlens.practiceQueue.records', {
		version: 1, records: [{ ...item(), sourceCode: 'private source', title: 'private title', apiKey: 'secret' },
			{ ...item({ id: 'bad-practice', tag: 'local:javascript.empty-catch', category: 'testing' }) }]
	});
	assert.deepEqual(store.snapshot(), [item()]);
	for (let index = 0; index < 24; index += 1) {
		assert.equal(await store.add({ ...candidate, tag: 'provider:testing:suggestion', category: 'testing',
			languageId: `language-${index}` }), 'added');
		await store.setStatus(store.snapshot().at(-1)!.id, 'completed');
	}
	assert.equal(store.snapshot().length, 25);
	assert.equal(await store.add({ ...candidate, tag: 'provider:readability:suggestion', category: 'readability' }), 'full');
	assert.equal(store.snapshot().length, 25);
});

test('comparison distinguishes one sighting, recurrence, mixed signals, and absent evidence', () => {
	const origin = item();
	assert.equal(comparePractice(origin, snapshot([])).status, 'no-later-reviews');
	assert.equal(comparePractice(origin, snapshot([review(2, [])])).status, 'limited');
	assert.equal(comparePractice(origin, snapshot([suggestion(2)])).status, 'seen-once');
	const repeated = comparePractice(origin, snapshot([suggestion(2), suggestion(3)]));
	assert.equal(repeated.status, 'repeated');
	assert.equal(repeated.matchingReviewCount, 2);
	assert.deepEqual(repeated.examples.map(example => example.recordId), ['review-2', 'review-3']);
	const mixed = comparePractice(origin, snapshot([suggestion(2), strength(3)]));
	assert.equal(mixed.status, 'mixed');
	assert.equal(mixed.strengthReviewCount, 1);
	const absent = comparePractice(origin, snapshot([
		review(2, [observation('openai-suggestion-0', 'provider:error-handling:suggestion', 'suggestion')]),
		review(3, [observation('local-0', tag, 'suggestion', 'notApplicable')]),
		review(4, [observation('local-0', tag, 'suggestion', 'notHelpful')]),
		review(5, [observation('openai-suggestion-0', 'provider:error-handling:suggestion', 'suggestion')])
	]));
	assert.equal(absent.status, 'not-observed');
	assert.equal(absent.matchingReviewCount, 0);
	const html = renderPracticeHtml([origin], snapshot([review(2, []), review(3, [observation('openai-suggestion-0', 'provider:error-handling:suggestion', 'suggestion')])]), 'intermediate', 'nonce');
	assert.match(html, /not proof.*fixed or.*mastered/i);
	assert.doesNotMatch(html, /you have mastered|skill score|streak/i);
});

test('comparison ignores other languages and goals, and reflects deleted retained reviews', () => {
	const origin = item();
	const records = [suggestion(2), review(3, [observation('local-0', tag, 'suggestion')], 'python'),
		review(4, [observation('local-0', tag, 'suggestion')], 'typescript', 'old-goal')];
	assert.equal(comparePractice(origin, snapshot(records)).status, 'seen-once');
	assert.equal(comparePractice(origin, snapshot(records.filter(record => record.id !== 'review-2'))).status, 'no-later-reviews');
	assert.equal(comparePractice(origin, snapshot([review(1, [observation('local-0', tag, 'suggestion')])])).status, 'no-later-reviews');
});

test('practice prompts adapt by explanation depth and renderer keeps code and markup out', () => {
	const origin = item({ languageId: '<img src=x onerror=alert(1)>' });
	const beginner = practicePrompt(origin, 'beginner');
	const advanced = practicePrompt(origin, 'advanced');
	assert.notEqual(beginner.exercise, advanced.exercise);
	assert.match(beginner.exercise, /small scratch example/i);
	assert.match(advanced.selfCheck, /assumptions/i);
	assert.doesNotMatch(JSON.stringify(beginner), /sourceCode|eval\(value\)/);
	const html = renderPracticeHtml([origin], snapshot([]), 'advanced', 'nonce');
	assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
	assert.doesNotMatch(html, /<img src=x/);
	assert.match(html, /button:focus-visible/);
	assert.match(html, /data-action="reviewSelection"/);
	assert.match(html, /data-action="pause"/);
});
