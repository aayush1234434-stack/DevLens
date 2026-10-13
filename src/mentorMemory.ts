import { randomUUID } from 'crypto';
import { AnalysisResult, LocalFinding } from './analyzer';
import { MentorCategory, MentorObservation, MentorReview } from './mentorReview';

export type MemoryCategory = MentorCategory;
export type MemoryFeedback = 'helpful' | 'notHelpful' | 'notApplicable';
export type MemoryPreference = 'focus' | 'less';

export interface MemoryObservation {
	id: string;
	tag: string;
	category: MemoryCategory;
	kind: 'strength' | 'suggestion';
	feedback?: MemoryFeedback;
}

export interface MemoryRecord {
	id: string;
	createdAt: string;
	languageId: string;
	goalEpoch: string;
	observations: MemoryObservation[];
}

export interface MemorySettings {
	version: 1;
	enabled: boolean;
	paused: boolean;
	retentionLimit: number;
	goalEpoch: string;
	focusCategories: MemoryCategory[];
	lessCategories: MemoryCategory[];
}

export interface MemoryPattern {
	tag: string;
	label: string;
	category: MemoryCategory;
	reviewCount: number;
	examples: { date: string; languageId: string }[];
}

export interface MemorySnapshot {
	settings: MemorySettings;
	records: MemoryRecord[];
	patterns: MemoryPattern[];
}

export interface MemoryStorage {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void>;
}

const settingsKey = 'devlens.mentorMemory.settings';
const recordsKey = 'devlens.mentorMemory.records';
const categories: readonly MemoryCategory[] = [
	'correctness', 'security', 'readability', 'testing', 'error-handling',
	'architecture', 'performance', 'accessibility'
];
const localTags: Record<string, string> = {
	'javascript.eval-call': 'Direct eval call',
	'javascript.empty-catch': 'Empty catch block',
	'typescript.explicit-contract': 'Explicit function type contract'
};
const feedbackValues: readonly MemoryFeedback[] = ['helpful', 'notHelpful', 'notApplicable'];

export const defaultMemorySettings: MemorySettings = {
	version: 1, enabled: false, paused: false, retentionLimit: 25,
	goalEpoch: 'initial', focusCategories: [], lessCategories: []
};

/** Stores only whitelisted metadata. Source, excerpts, titles, paths and credentials never enter this model. */
export class MentorMemoryStore {
	private pending: Promise<void> = Promise.resolve();
	private readonly listeners = new Set<() => void>();

	constructor(private readonly storage: MemoryStorage) {}

	async initialize(): Promise<void> {
		const raw = this.storage.get<unknown>(recordsKey);
		if (isRecord(raw) && raw.version === 0) await this.mutate(snapshot => snapshot);
	}

	onDidChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	snapshot(): MemorySnapshot {
		const settings = normalizeSettings(this.storage.get<unknown>(settingsKey));
		const records = normalizeRecords(this.storage.get<unknown>(recordsKey)).slice(-settings.retentionLimit);
		return { settings, records, patterns: summarizePatterns(records, settings.goalEpoch) };
	}

	async enable(): Promise<void> {
		await this.mutate(snapshot => ({ ...snapshot, settings: { ...snapshot.settings, enabled: true, paused: false } }));
	}

	async disable(): Promise<void> {
		await this.mutate(snapshot => ({ ...snapshot, settings: { ...snapshot.settings, enabled: false } }));
	}

	async togglePause(): Promise<void> {
		await this.mutate(snapshot => ({ ...snapshot, settings: { ...snapshot.settings, paused: !snapshot.settings.paused } }));
	}

	async setRetentionLimit(limit: number): Promise<void> {
		if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Choose a retention limit from 1 to 100 reviews.');
		await this.mutate(snapshot => ({
			...snapshot, settings: { ...snapshot.settings, retentionLimit: limit }, records: snapshot.records.slice(-limit)
		}));
	}

	async setPreference(category: MemoryCategory, preference: MemoryPreference): Promise<void> {
		if (!categories.includes(category)) return;
		const current = this.snapshot().settings;
		if (!current.enabled || current.paused) return;
		await this.mutate(snapshot => {
			if (!snapshot.settings.enabled || snapshot.settings.paused) return snapshot;
			const focus = snapshot.settings.focusCategories.filter(item => item !== category);
			const less = snapshot.settings.lessCategories.filter(item => item !== category);
			if (preference === 'focus') focus.push(category);
			else less.push(category);
			return { ...snapshot, settings: { ...snapshot.settings, focusCategories: focus, lessCategories: less } };
		});
	}

	async resetAdaptation(): Promise<void> {
		await this.mutate(snapshot => ({
			...snapshot,
			settings: { ...snapshot.settings, focusCategories: [], lessCategories: [] },
			records: snapshot.records.map(record => record.goalEpoch === snapshot.settings.goalEpoch
				? { ...record, observations: record.observations.map(({ feedback: _feedback, ...observation }) => observation) }
				: record)
		}));
	}

	async goalChanged(): Promise<void> {
		await this.mutate(snapshot => ({
			...snapshot,
			settings: { ...snapshot.settings, goalEpoch: randomUUID(), focusCategories: [], lessCategories: [] }
		}));
	}

	async startReview(languageId: string, analysis: AnalysisResult): Promise<string | undefined> {
		const current = this.snapshot().settings;
		if (!current.enabled || current.paused) return undefined;
		const id = randomUUID();
		let saved = false;
		await this.mutate(snapshot => {
			if (!snapshot.settings.enabled || snapshot.settings.paused) return snapshot;
			saved = true;
			return {
				...snapshot,
				records: [...snapshot.records, {
					id, createdAt: new Date().toISOString(), languageId: safeLanguageId(languageId),
					goalEpoch: snapshot.settings.goalEpoch,
					observations: analysis.findings.map((finding, index) => localObservation(finding, index))
				}].slice(-snapshot.settings.retentionLimit)
			};
		});
		return saved ? id : undefined;
	}

	async appendProviderReview(recordId: string | undefined, review: MentorReview): Promise<void> {
		if (!recordId) return;
		const current = this.snapshot().settings;
		if (!current.enabled || current.paused) return;
		await this.mutate(snapshot => {
			if (!snapshot.settings.enabled || snapshot.settings.paused) return snapshot;
			return {
				...snapshot,
				records: snapshot.records.map(record => record.id === recordId
					? { ...record, observations: [...record.observations,
						...review.strengths.map(providerObservation), ...review.suggestions.map(providerObservation)] }
					: record)
			};
		});
	}

	async setFeedback(recordId: string | undefined, observationId: string, feedback: MemoryFeedback): Promise<boolean> {
		if (!recordId || !feedbackValues.includes(feedback)) return false;
		const current = this.snapshot().settings;
		if (!current.enabled || current.paused) return false;
		let saved = false;
		await this.mutate(snapshot => {
			if (!snapshot.settings.enabled || snapshot.settings.paused) return snapshot;
			return {
				...snapshot,
				records: snapshot.records.map(record => record.id === recordId
					? { ...record, observations: record.observations.map(observation => {
						if (observation.id !== observationId) return observation;
						saved = true;
						return { ...observation, feedback };
					}) }
					: record)
			};
		});
		return saved;
	}

	async deleteRecord(id: string): Promise<void> {
		await this.mutate(snapshot => ({ ...snapshot, records: snapshot.records.filter(record => record.id !== id) }));
	}

	async clear(): Promise<void> {
		await this.mutate(snapshot => ({ ...snapshot, records: [] }));
	}

	async clearCurrentGoal(): Promise<void> {
		await this.mutate(snapshot => ({
			...snapshot,
			settings: { ...snapshot.settings, focusCategories: [], lessCategories: [] },
			records: snapshot.records.filter(record => record.goalEpoch !== snapshot.settings.goalEpoch)
		}));
	}

	private async mutate(change: (snapshot: MemorySnapshot) => MemorySnapshot): Promise<void> {
		const action = this.pending.then(async () => {
			const before = this.snapshot();
			const after = change(before);
			await this.storage.update(settingsKey, after.settings);
			await this.storage.update(recordsKey, { version: 1, records: after.records.slice(-after.settings.retentionLimit) });
			for (const listener of this.listeners) listener();
		});
		this.pending = action.catch(() => undefined);
		await action;
	}
}

export function categoryPriority(snapshot: MemorySnapshot, category: MemoryCategory): number {
	if (!snapshot.settings.enabled || snapshot.settings.paused) return 0;
	let priority = snapshot.settings.focusCategories.includes(category) ? 5 : 0;
	if (snapshot.settings.lessCategories.includes(category)) priority -= 5;
	let feedbackScore = 0;
	for (const record of snapshot.records) {
		if (record.goalEpoch !== snapshot.settings.goalEpoch) continue;
		for (const observation of record.observations) {
			if (observation.category !== category) continue;
			if (observation.feedback === 'helpful') feedbackScore += 1;
			if (observation.feedback === 'notHelpful') feedbackScore -= 1;
			if (observation.feedback === 'notApplicable') feedbackScore -= 2;
		}
	}
	return priority + Math.max(-3, Math.min(3, feedbackScore));
}

export function prioritizeByMemory<T extends { category: MemoryCategory }>(items: readonly T[], snapshot: MemorySnapshot): T[] {
	return items.map((item, index) => ({ item, index }))
		.sort((a, b) => categoryPriority(snapshot, b.item.category) - categoryPriority(snapshot, a.item.category) || a.index - b.index)
		.map(entry => entry.item);
}

function localObservation(finding: LocalFinding, index: number): MemoryObservation {
	return {
		id: `local-${index}`, tag: `local:${finding.id}`, category: finding.category,
		kind: finding.kind === 'strength' ? 'strength' : 'suggestion'
	};
}

function providerObservation(observation: MentorObservation): MemoryObservation {
	return {
		id: observation.id, tag: `provider:${observation.category}:${observation.kind}`,
		category: observation.category, kind: observation.kind
	};
}

function summarizePatterns(records: MemoryRecord[], goalEpoch: string): MemoryPattern[] {
	const groups = new Map<string, MemoryPattern>();
	for (const record of records) {
		if (record.goalEpoch !== goalEpoch) continue;
		const seen = new Set<string>();
		for (const observation of record.observations) {
			if (observation.feedback === 'notApplicable' || observation.kind === 'strength' || seen.has(observation.tag)) continue;
			seen.add(observation.tag);
			let group = groups.get(observation.tag);
			if (!group) {
				group = { tag: observation.tag, label: memoryTagLabel(observation.tag, observation.category), category: observation.category, reviewCount: 0, examples: [] };
				groups.set(observation.tag, group);
			}
			group.reviewCount += 1;
			group.examples.push({ date: record.createdAt.slice(0, 10), languageId: record.languageId });
		}
	}
	return [...groups.values()].filter(group => group.reviewCount >= 2)
		.sort((a, b) => b.reviewCount - a.reviewCount || a.label.localeCompare(b.label))
		.slice(0, 5)
		.map(group => ({ ...group, examples: group.examples.slice(-3) }));
}

export function memoryTagLabel(tag: string, category: MemoryCategory): string {
	if (tag.startsWith('local:')) return localTags[tag.slice(6)] ?? category;
	return `OpenAI ${category} ${tag.endsWith(':strength') ? 'strengths' : 'suggestions'} (broad theme)`;
}

function normalizeSettings(raw: unknown): MemorySettings {
	if (!isRecord(raw) || raw.version !== 1) return { ...defaultMemorySettings };
	const focusCategories = safeCategories(raw.focusCategories);
	const lessCategories = safeCategories(raw.lessCategories).filter(item => !focusCategories.includes(item));
	return {
		version: 1,
		enabled: raw.enabled === true,
		paused: raw.paused === true,
		retentionLimit: Number.isInteger(raw.retentionLimit) && Number(raw.retentionLimit) >= 1 && Number(raw.retentionLimit) <= 100
			? Number(raw.retentionLimit) : 25,
		goalEpoch: typeof raw.goalEpoch === 'string' && /^[a-zA-Z0-9-]{1,40}$/.test(raw.goalEpoch) ? raw.goalEpoch : 'initial',
		focusCategories, lessCategories
	};
}

function normalizeRecords(raw: unknown): MemoryRecord[] {
	if (!isRecord(raw) || !Array.isArray(raw.records)) return [];
	if (raw.version !== 1 && raw.version !== 0) return [];
	return raw.records.slice(-100).map(item => normalizeRecord(item, raw.version === 0)).filter((item): item is MemoryRecord => item !== undefined);
}

function normalizeRecord(raw: unknown, legacy: boolean): MemoryRecord | undefined {
	if (!isRecord(raw) || typeof raw.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(raw.id)) return undefined;
	const createdAt = legacy ? raw.at : raw.createdAt;
	if (typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) return undefined;
	const languageId = legacy ? raw.language : raw.languageId;
	const observations = legacy ? raw.findings : raw.observations;
	return {
		id: raw.id,
		createdAt: new Date(createdAt).toISOString(),
		languageId: safeLanguageId(languageId),
		goalEpoch: legacy ? 'initial' : typeof raw.goalEpoch === 'string' && /^[a-zA-Z0-9-]{1,40}$/.test(raw.goalEpoch) ? raw.goalEpoch : 'initial',
		observations: Array.isArray(observations) ? observations.slice(0, 12).map(normalizeObservation).filter((item): item is MemoryObservation => item !== undefined) : []
	};
}

function normalizeObservation(raw: unknown): MemoryObservation | undefined {
	if (!isRecord(raw) || typeof raw.id !== 'string' || !/^(local-\d+|openai-(strength|suggestion)-\d+)$/.test(raw.id) ||
		typeof raw.tag !== 'string' || typeof raw.category !== 'string' || !categories.includes(raw.category as MemoryCategory) ||
		(raw.kind !== 'strength' && raw.kind !== 'suggestion')) return undefined;
	const category = raw.category as MemoryCategory;
	const validLocal = raw.tag.startsWith('local:') && localTags[raw.tag.slice(6)] !== undefined && raw.id.startsWith('local-');
	const validProvider = raw.tag === `provider:${category}:${raw.kind}` && raw.id.startsWith('openai-');
	if (!validLocal && !validProvider) return undefined;
	return {
		id: raw.id, tag: raw.tag, category, kind: raw.kind,
		...(feedbackValues.includes(raw.feedback as MemoryFeedback) ? { feedback: raw.feedback as MemoryFeedback } : {})
	};
}

function safeCategories(raw: unknown): MemoryCategory[] {
	return Array.isArray(raw) ? [...new Set(raw.filter((item): item is MemoryCategory => categories.includes(item as MemoryCategory)))].slice(0, categories.length) : [];
}

function safeLanguageId(value: unknown): string {
	return typeof value === 'string' && /^[a-zA-Z0-9+.#_-]{1,40}$/.test(value) ? value : 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
