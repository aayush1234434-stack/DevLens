import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCode } from '../src/analyzer';
import { categoryPriority, defaultMemorySettings, MemoryStorage, MentorMemoryStore, prioritizeByMemory } from '../src/mentorMemory';
import { MentorReview } from '../src/mentorReview';

class TestStorage implements MemoryStorage {
	readonly values = new Map<string, unknown>();
	writes = 0;
	get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
	async update(key: string, value: unknown): Promise<void> { this.writes += 1; this.values.set(key, structuredClone(value)); }
}

const code = 'try { eval("PRIVATE_SOURCE_123"); } catch (error) {}';
const analysis = analyzeCode('javascript', code);

test('mentor memory is off by default and never saves a review before opt-in', async () => {
	const storage = new TestStorage();
	const memory = new MentorMemoryStore(storage);
	assert.equal(memory.snapshot().settings.enabled, false);
	assert.equal(await memory.startReview('javascript', analysis), undefined);
	assert.equal(storage.writes, 0);
	assert.deepEqual(memory.snapshot().records, []);
});

test('stored review data excludes source, evidence, filenames and secrets', async () => {
	const storage = new TestStorage();
	const memory = new MentorMemoryStore(storage);
	await memory.enable();
	const id = await memory.startReview('javascript', analysis);
	assert.ok(id);
	await memory.setFeedback(id, 'local-0', 'helpful');
	const saved = JSON.stringify([...storage.values.values()]);
	assert.doesNotMatch(saved, /PRIVATE_SOURCE_123|eval\(|evidence|fileName|apiKey/);
	assert.match(saved, /javascript\.eval-call/);
	assert.equal(memory.snapshot().records[0].observations[0].feedback, 'helpful');
});

test('explicit feedback and focus choices reorder categories and can be reset', async () => {
	const memory = new MentorMemoryStore(new TestStorage());
	await memory.enable();
	const id = await memory.startReview('javascript', analysis);
	assert.ok(id);
	await memory.setPreference('error-handling', 'focus');
	assert.ok(categoryPriority(memory.snapshot(), 'error-handling') > categoryPriority(memory.snapshot(), 'security'));
	const ordered = prioritizeByMemory([{ category: 'security' as const }, { category: 'error-handling' as const }], memory.snapshot());
	assert.equal(ordered[0].category, 'error-handling');
	await memory.setFeedback(id, 'local-0', 'notHelpful');
	assert.ok(categoryPriority(memory.snapshot(), 'security') < 0);
	await memory.setPreference('error-handling', 'less');
	assert.ok(categoryPriority(memory.snapshot(), 'error-handling') < 0);
	await memory.resetAdaptation();
	assert.deepEqual(memory.snapshot().settings.focusCategories, []);
	assert.deepEqual(memory.snapshot().settings.lessCategories, []);
	assert.equal(memory.snapshot().records[0].observations[0].feedback, undefined);
	assert.equal(categoryPriority(memory.snapshot(), 'security'), 0);
});

test('pause stops retention and adaptation; deletion, clearing and retention remove records', async () => {
	const memory = new MentorMemoryStore(new TestStorage());
	await memory.enable();
	const first = await memory.startReview('javascript', analysis);
	assert.ok(first);
	await memory.setPreference('security', 'focus');
	await memory.togglePause();
	assert.equal(await memory.startReview('javascript', analysis), undefined);
	assert.equal(categoryPriority(memory.snapshot(), 'security'), 0);
	assert.equal(await memory.setFeedback(first, 'local-0', 'helpful'), false);
	await memory.togglePause();
	await memory.startReview('javascript', analysis);
	await memory.startReview('javascript', analysis);
	await memory.setRetentionLimit(2);
	assert.equal(memory.snapshot().records.length, 2);
	assert.ok(memory.snapshot().records.every(record => record.id !== first));
	const remaining = memory.snapshot().records[0].id;
	await memory.deleteRecord(remaining);
	assert.equal(memory.snapshot().records.length, 1);
	await memory.clear();
	assert.deepEqual(memory.snapshot().records, []);
});

test('recurrence counts separate reviews and goal changes retire old feedback from current focus', async () => {
	const memory = new MentorMemoryStore(new TestStorage());
	await memory.enable();
	const first = await memory.startReview('javascript', analysis);
	const second = await memory.startReview('javascript', analysis);
	assert.ok(first && second);
	const pattern = memory.snapshot().patterns.find(item => item.tag === 'local:javascript.eval-call');
	assert.equal(pattern?.reviewCount, 2);
	assert.equal(pattern?.examples.length, 2);
	await memory.setFeedback(first, 'local-0', 'notApplicable');
	assert.equal(memory.snapshot().patterns.find(item => item.tag === 'local:javascript.eval-call'), undefined);
	await memory.setFeedback(second, 'local-0', 'helpful');
	assert.ok(categoryPriority(memory.snapshot(), 'security') < 0);
	await memory.goalChanged();
	assert.equal(memory.snapshot().records.length, 2);
	assert.equal(memory.snapshot().patterns.length, 0);
	assert.equal(categoryPriority(memory.snapshot(), 'security'), 0);
});

test('legacy metadata migrates through a strict allowlist and unknown versions are ignored', async () => {
	const storage = new TestStorage();
	storage.values.set('devlens.mentorMemory.settings', { ...defaultMemorySettings, enabled: true });
	storage.values.set('devlens.mentorMemory.records', { version: 0, records: [{
		id: 'old-1', at: '2026-10-01T12:00:00.000Z', language: 'python', source: 'SECRET_SOURCE',
		findings: [{ id: 'openai-suggestion-0', tag: 'provider:testing:suggestion', category: 'testing', kind: 'suggestion', title: 'SECRET_TITLE' }]
	}] });
	const memory = new MentorMemoryStore(storage);
	assert.equal(memory.snapshot().records[0].observations[0].category, 'testing');
	await memory.initialize();
	assert.doesNotMatch(JSON.stringify([...storage.values.values()]), /SECRET_SOURCE|SECRET_TITLE/);
	assert.equal((storage.values.get('devlens.mentorMemory.records') as { version: number }).version, 1);
	storage.values.set('devlens.mentorMemory.records', { version: 99, records: [{ source: 'SECRET_SOURCE' }] });
	assert.deepEqual(memory.snapshot().records, []);
});

test('provider metadata is appended only to a retained, active record', async () => {
	const memory = new MentorMemoryStore(new TestStorage());
	await memory.enable();
	const id = await memory.startReview('python', analyzeCode('python', 'print(1)'));
	assert.ok(id);
	const review: MentorReview = { formatVersion: 1, takeaway: 'Not retained', strengths: [], suggestions: [{
		id: 'openai-suggestion-0', kind: 'suggestion', category: 'testing', title: 'Never store this title',
		evidence: { startOffset: 0, endOffset: 8, startLine: 0, endLine: 0, text: 'print(1)' },
		what: 'Never store this text', whyItMatters: 'Never store this text', whyThis: 'Never store this text',
		action: 'Never store this text', confidence: 'medium', provenance: 'openai-assisted'
	}] };
	await memory.appendProviderReview(id, review);
	assert.equal(memory.snapshot().records[0].observations[0].tag, 'provider:testing:suggestion');
	await memory.deleteRecord(id);
	await memory.appendProviderReview(id, review);
	assert.equal(memory.snapshot().records.length, 0);
});
