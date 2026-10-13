import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCode } from '../src/analyzer';
import { defaultMemorySettings, MemoryObservation, MemoryRecord, MemorySnapshot, MemoryStorage, MentorMemoryStore } from '../src/mentorMemory';
import { buildSkillProfile, matchGoalAreas, normalizeSkillProfileSettings, SkillProfilePreferences } from '../src/skillProfile';
import { renderSkillProfileHtml } from '../src/skillProfileView';

class TestStorage implements MemoryStorage {
	readonly values = new Map<string, unknown>();
	get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
	async update(key: string, value: unknown): Promise<void> { this.values.set(key, structuredClone(value)); }
}

function observation(id: string, category: MemoryObservation['category'], kind: MemoryObservation['kind'], feedback?: MemoryObservation['feedback']): MemoryObservation {
	return { id, category, kind, tag: `provider:${category}:${kind}`, ...(feedback ? { feedback } : {}) };
}

function record(index: number, observations: MemoryObservation[], goalEpoch = 'goal-a'): MemoryRecord {
	return {
		id: `record-${index}`, createdAt: `2026-10-${String(index).padStart(2, '0')}T12:00:00.000Z`,
		languageId: index % 2 ? 'typescript' : 'python', goalEpoch, observations
	};
}

function snapshot(records: MemoryRecord[], enabled = true): MemorySnapshot {
	return {
		settings: { ...defaultMemorySettings, enabled, goalEpoch: 'goal-a' },
		records, patterns: []
	};
}

const defaultSettings = normalizeSkillProfileSettings(undefined);

test('skill profile waits for three opted-in reviews with usable observations', () => {
	const one = record(1, [observation('openai-suggestion-0', 'testing', 'suggestion')]);
	const two = record(2, [observation('openai-suggestion-0', 'testing', 'suggestion')]);
	const empty = record(3, []);
	assert.equal(buildSkillProfile(snapshot([]), defaultSettings).status, 'insufficient');
	assert.equal(buildSkillProfile(snapshot([one, two, empty]), defaultSettings).status, 'insufficient');
	assert.equal(buildSkillProfile(snapshot([one, two, record(4, [observation('openai-strength-0', 'readability', 'strength')])]), defaultSettings).status, 'ready');
	const off = buildSkillProfile(snapshot([one, two, empty], false), defaultSettings);
	assert.equal(off.status, 'insufficient');
	assert.equal(off.memoryEnabled, false);
});

test('areas separate strengths and opportunities, deduplicate within a review, and link metadata examples', () => {
	const records = [
		record(1, [observation('openai-suggestion-0', 'testing', 'suggestion'), observation('openai-suggestion-1', 'testing', 'suggestion')]),
		record(2, [observation('openai-strength-0', 'testing', 'strength')]),
		record(3, [observation('openai-suggestion-0', 'testing', 'suggestion')])
	];
	const profile = buildSkillProfile(snapshot(records), defaultSettings, 'Improve testing');
	assert.equal(profile.status, 'ready');
	assert.deepEqual(profile.goalAreas, ['testing']);
	const area = profile.areas.find(item => item.category === 'testing');
	assert.ok(area);
	assert.equal(area.reviewCount, 3);
	assert.equal(area.strengths[0].reviewCount, 1);
	assert.match(area.strengths[0].label, /strengths/);
	assert.equal(area.opportunities[0].reviewCount, 2);
	assert.deepEqual(area.opportunities[0].examples.map(example => example.recordId), ['record-1', 'record-3']);
	assert.deepEqual(area.opportunities[0].examples.map(example => example.languageId), ['typescript', 'typescript']);
});

test('time comparison reports sample counts without claiming mastery from absent tags', () => {
	const records = [
		record(1, [observation('openai-suggestion-0', 'testing', 'suggestion')]),
		record(2, [observation('openai-suggestion-0', 'testing', 'suggestion')]),
		record(3, [observation('openai-strength-0', 'testing', 'strength')]),
		record(4, [observation('openai-strength-0', 'testing', 'strength')])
	];
	const profile = buildSkillProfile(snapshot(records), defaultSettings);
	const area = profile.areas[0];
	assert.deepEqual(area.trend, {
		earlierSamples: 2, recentSamples: 2,
		earlierStrengthReviews: 0, recentStrengthReviews: 2,
		earlierOpportunityReviews: 2, recentOpportunityReviews: 0
	});
	const html = renderSkillProfileHtml(profile, '', 'test-nonce');
	assert.match(html, /an absent tag does not prove improvement/i);
	assert.match(html, /Strengths observed/);
	assert.match(html, /Opportunities practiced/);
	assert.match(html, /data-record-id="record-1"/);
	assert.doesNotMatch(html, /score|rank|job.readiness/i);
});

test('rejected advice, deleted reviews, new goals, and reset baselines remove unsupported summaries', async () => {
	const records = [
		record(1, [observation('openai-suggestion-0', 'testing', 'suggestion')]),
		record(2, [observation('openai-suggestion-0', 'testing', 'suggestion', 'notApplicable')]),
		record(3, [observation('openai-suggestion-0', 'testing', 'suggestion', 'notHelpful')]),
		record(4, [observation('openai-strength-0', 'readability', 'strength')], 'old-goal'),
		record(5, [observation('openai-strength-0', 'readability', 'strength')])
	];
	assert.equal(buildSkillProfile(snapshot(records), defaultSettings).status, 'insufficient');
	const three = record(6, [observation('openai-suggestion-0', 'testing', 'suggestion')]);
	const four = record(7, [observation('openai-suggestion-0', 'testing', 'suggestion')]);
	assert.equal(buildSkillProfile(snapshot([...records, three, four]), defaultSettings).status, 'ready');
	assert.equal(buildSkillProfile(snapshot([...records, three].filter(item => item.id !== 'record-1')), defaultSettings).status, 'insufficient');

	const storage = new TestStorage();
	const preferences = new SkillProfilePreferences(storage);
	await preferences.reset(new Date('2026-10-06T00:00:00.000Z'));
	assert.equal(buildSkillProfile(snapshot([...records, three, four]), preferences.snapshot()).status, 'insufficient');
	await preferences.includeEarlierReviews();
	assert.equal(buildSkillProfile(snapshot([...records, three, four]), preferences.snapshot()).status, 'ready');
	await preferences.setHidden(true);
	assert.equal(buildSkillProfile(snapshot([...records, three, four]), preferences.snapshot()).status, 'hidden');
	assert.deepEqual(buildSkillProfile(snapshot([...records, three, four]), preferences.snapshot()).areas, []);
});

test('clearing current-goal records preserves earlier goals and removes current focus', async () => {
	const storage = new TestStorage();
	const memory = new MentorMemoryStore(storage);
	await memory.enable();
	const oldId = await memory.startReview('javascript', analyzeCode('javascript', 'eval(value)'));
	assert.ok(oldId);
	await memory.goalChanged();
	const currentId = await memory.startReview('javascript', analyzeCode('javascript', 'eval(value)'));
	assert.ok(currentId);
	await memory.setPreference('security', 'focus');
	await memory.clearCurrentGoal();
	assert.deepEqual(memory.snapshot().records.map(item => item.id), [oldId]);
	assert.deepEqual(memory.snapshot().settings.focusCategories, []);
	assert.equal(memory.snapshot().patterns.length, 0);
});

test('goal matching is conservative and the panel escapes user text', () => {
	assert.deepEqual(matchGoalAreas('I want better tests and error handling'), ['testing', 'error-handling']);
	assert.deepEqual(matchGoalAreas('Become a senior engineer'), []);
	const records = [1, 2, 3].map(index => record(index, [observation('openai-suggestion-0', 'testing', 'suggestion')]));
	const html = renderSkillProfileHtml(buildSkillProfile(snapshot(records), defaultSettings, '<script>alert(1)</script>'), '<script>alert(1)</script>', 'test-nonce');
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
	assert.match(html, /default-src 'none'/);
	assert.match(html, /data-action="clear"/);
	const hidden = renderSkillProfileHtml(buildSkillProfile(snapshot(records), { ...defaultSettings, hidden: true }), '', 'test-nonce');
	assert.doesNotMatch(hidden, /data-record-id=/);
});
