import { MemoryCategory, MemoryObservation, MemoryRecord, MemorySnapshot, MemoryStorage, memoryTagLabel } from './mentorMemory';

export interface SkillProfileSettings {
	version: 1;
	hidden: boolean;
	startAfter: string;
}

export interface SkillExample {
	recordId: string;
	date: string;
	languageId: string;
	tag: string;
	label: string;
}

export interface SkillTopic {
	tag: string;
	label: string;
	reviewCount: number;
	examples: SkillExample[];
}

export interface SkillTrend {
	earlierSamples: number;
	recentSamples: number;
	earlierStrengthReviews: number;
	recentStrengthReviews: number;
	earlierOpportunityReviews: number;
	recentOpportunityReviews: number;
}

export interface SkillArea {
	category: MemoryCategory;
	label: string;
	reviewCount: number;
	strengths: SkillTopic[];
	opportunities: SkillTopic[];
	trend?: SkillTrend;
}

export interface SkillProfile {
	status: 'hidden' | 'insufficient' | 'ready';
	retainedReviewCount: number;
	evidenceReviewCount: number;
	minimumReviewCount: number;
	areas: SkillArea[];
	goalAreas: MemoryCategory[];
	focusAreas: MemoryCategory[];
	memoryEnabled: boolean;
	memoryPaused: boolean;
	startAfter: string;
}

const settingsKey = 'devlens.skillProfile.settings';
const minimumReviewCount = 3;
const minimumTrendReviewCount = 4;

export const areaLabels: Record<MemoryCategory, string> = {
	correctness: 'Correctness',
	security: 'Security',
	readability: 'Readability',
	testing: 'Testing',
	'error-handling': 'Error handling',
	architecture: 'Architecture',
	performance: 'Performance',
	accessibility: 'Accessibility'
};

const goalKeywords: readonly { category: MemoryCategory; pattern: RegExp }[] = [
	{ category: 'testing', pattern: /\b(test|tests|testing|testability|coverage)\b/i },
	{ category: 'readability', pattern: /\b(readability|readable|maintainability|maintainable|clarity)\b/i },
	{ category: 'error-handling', pattern: /\b(error|errors|exception|exceptions|failure|failures|recovery)\b/i },
	{ category: 'architecture', pattern: /\b(architecture|architectural|design|modularity|modular)\b/i },
	{ category: 'performance', pattern: /\b(performance|latency|speed|optimization|efficient)\b/i },
	{ category: 'security', pattern: /\b(security|secure|vulnerability|vulnerabilities)\b/i },
	{ category: 'accessibility', pattern: /\b(accessibility|accessible|a11y)\b/i },
	{ category: 'correctness', pattern: /\b(correctness|bug|bugs|reliability)\b/i }
];

export class SkillProfilePreferences {
	constructor(private readonly storage: MemoryStorage) {}

	snapshot(): SkillProfileSettings {
		return normalizeSkillProfileSettings(this.storage.get<unknown>(settingsKey));
	}

	async setHidden(hidden: boolean): Promise<void> {
		await this.storage.update(settingsKey, { ...this.snapshot(), hidden });
	}

	async reset(now = new Date()): Promise<void> {
		await this.storage.update(settingsKey, { ...this.snapshot(), startAfter: now.toISOString() });
	}

	async includeEarlierReviews(): Promise<void> {
		await this.storage.update(settingsKey, { ...this.snapshot(), startAfter: '' });
	}
}

export function normalizeSkillProfileSettings(raw: unknown): SkillProfileSettings {
	if (!isRecord(raw) || raw.version !== 1) return { version: 1, hidden: false, startAfter: '' };
	const startAfter = typeof raw.startAfter === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw.startAfter) &&
		Number.isFinite(Date.parse(raw.startAfter)) ? new Date(raw.startAfter).toISOString() : '';
	return { version: 1, hidden: raw.hidden === true, startAfter };
}

/** Derived on demand from opted-in metadata. Nothing in this assessment is persisted. */
export function buildSkillProfile(memory: MemorySnapshot, settings: SkillProfileSettings, goal = ''): SkillProfile {
	const records = memory.records
		.filter(record => record.goalEpoch === memory.settings.goalEpoch && (!settings.startAfter || record.createdAt > settings.startAfter))
		.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
	const evidenceRecords = records.filter(record => usableObservations(record).length > 0);
	const base: SkillProfile = {
		status: settings.hidden ? 'hidden' : evidenceRecords.length < minimumReviewCount ? 'insufficient' : 'ready',
		retainedReviewCount: records.length,
		evidenceReviewCount: evidenceRecords.length,
		minimumReviewCount,
		areas: [],
		goalAreas: matchGoalAreas(goal),
		focusAreas: [...memory.settings.focusCategories],
		memoryEnabled: memory.settings.enabled,
		memoryPaused: memory.settings.paused,
		startAfter: settings.startAfter
	};
	if (base.status !== 'ready') return base;

	const areas = new Map<MemoryCategory, SkillArea>();
	for (const record of evidenceRecords) {
		const seenCategories = new Set<MemoryCategory>();
		const seenTopics = new Set<string>();
		for (const observation of usableObservations(record)) {
			let area = areas.get(observation.category);
			if (!area) {
				area = { category: observation.category, label: areaLabels[observation.category], reviewCount: 0, strengths: [], opportunities: [] };
				areas.set(observation.category, area);
			}
			if (!seenCategories.has(observation.category)) {
				area.reviewCount += 1;
				seenCategories.add(observation.category);
			}
			const key = `${observation.kind}:${observation.tag}`;
			if (seenTopics.has(key)) continue;
			seenTopics.add(key);
			const topics = observation.kind === 'strength' ? area.strengths : area.opportunities;
			let topic = topics.find(item => item.tag === observation.tag);
			if (!topic) {
				topic = { tag: observation.tag, label: memoryTagLabel(observation.tag, observation.category), reviewCount: 0, examples: [] };
				topics.push(topic);
			}
			topic.reviewCount += 1;
			topic.examples.push({
				recordId: record.id, date: record.createdAt.slice(0, 10), languageId: record.languageId,
				tag: observation.tag, label: topic.label
			});
		}
	}
	for (const area of areas.values()) {
		area.strengths.sort(sortTopics);
		area.opportunities.sort(sortTopics);
		if (evidenceRecords.length >= minimumTrendReviewCount && area.reviewCount >= 2) {
			const midpoint = Math.floor(evidenceRecords.length / 2);
			const earlier = evidenceRecords.slice(0, midpoint);
			const recent = evidenceRecords.slice(midpoint);
			area.trend = {
				earlierSamples: earlier.length, recentSamples: recent.length,
				earlierStrengthReviews: reviewCount(earlier, area.category, 'strength'),
				recentStrengthReviews: reviewCount(recent, area.category, 'strength'),
				earlierOpportunityReviews: reviewCount(earlier, area.category, 'suggestion'),
				recentOpportunityReviews: reviewCount(recent, area.category, 'suggestion')
			};
		}
	}
	base.areas = [...areas.values()].sort((left, right) => right.reviewCount - left.reviewCount || left.label.localeCompare(right.label));
	return base;
}

export function matchGoalAreas(goal: string): MemoryCategory[] {
	if (!goal.trim()) return [];
	return goalKeywords.filter(item => item.pattern.test(goal)).map(item => item.category);
}

function usableObservations(record: MemoryRecord): MemoryObservation[] {
	return record.observations.filter(item => item.feedback !== 'notApplicable' && item.feedback !== 'notHelpful');
}

function reviewCount(records: MemoryRecord[], category: MemoryCategory, kind: MemoryObservation['kind']): number {
	return records.filter(record => usableObservations(record).some(item => item.category === category && item.kind === kind)).length;
}

function sortTopics(left: SkillTopic, right: SkillTopic): number {
	return right.reviewCount - left.reviewCount || left.label.localeCompare(right.label);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
