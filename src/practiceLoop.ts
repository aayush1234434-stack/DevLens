import { randomUUID } from 'crypto';
import { AnalysisResult } from './analyzer';
import { MemoryCategory, MemorySnapshot, MemoryStorage, memoryTagLabel } from './mentorMemory';
import { MentorReview } from './mentorReview';
import { areaLabels } from './skillProfile';

export type PracticeStatus = 'active' | 'paused' | 'completed' | 'notRelevant';
export type PracticeDepth = 'beginner' | 'intermediate' | 'advanced';

export interface PracticeItem {
	id: string;
	tag: string;
	category: MemoryCategory;
	languageId: string;
	goalEpoch: string;
	createdAt: string;
	status: PracticeStatus;
	lastPracticedAt?: string;
	sourceRecordId?: string;
}

export type PracticeCandidate = Pick<PracticeItem, 'tag' | 'category' | 'languageId' | 'goalEpoch'> &
	Pick<PracticeItem, 'sourceRecordId'>;

export interface PracticeComparison {
	status: 'no-later-reviews' | 'limited' | 'seen-once' | 'repeated' | 'mixed' | 'not-observed';
	laterReviewCount: number;
	taggedReviewCount: number;
	matchingReviewCount: number;
	strengthReviewCount: number;
	examples: { recordId: string; date: string; languageId: string; kind: 'suggestion' | 'strength' }[];
	sourceRetained: boolean;
}

const storageKey = 'devlens.practiceQueue.records';
const maxOpenItems = 3;
const maxRecords = 25;
const categories: readonly MemoryCategory[] = [
	'correctness', 'security', 'readability', 'testing', 'error-handling',
	'architecture', 'performance', 'accessibility'
];
const statuses: readonly PracticeStatus[] = ['active', 'paused', 'completed', 'notRelevant'];
/** Only an actual suggestion in the rendered review can become a practice card. */
export function practiceCandidateFromReview(
	analysis: AnalysisResult, review: MentorReview | undefined, observationId: string,
	languageId: string, goalEpoch: string, sourceRecordId?: string
): { candidate: PracticeCandidate; title: string } | undefined {
	const local = analysis.findings.find((finding, index) => `local-${index}` === observationId && finding.kind !== 'strength');
	if (local) return {
		candidate: { tag: `local:${local.id}`, category: local.category, languageId, goalEpoch, sourceRecordId },
		title: local.title
	};
	const remote = review?.suggestions.find(item => item.id === observationId);
	if (!remote) return undefined;
	return {
		candidate: { tag: `provider:${remote.category}:suggestion`, category: remote.category, languageId, goalEpoch, sourceRecordId },
		title: remote.title
	};
}

/** Explicitly saved concept metadata, separate from source-free mentor review history. */
export class PracticeStore {
	private pending: Promise<void> = Promise.resolve();
	private readonly listeners = new Set<() => void>();

	constructor(private readonly storage: MemoryStorage) {}

	snapshot(): PracticeItem[] {
		const raw = this.storage.get<unknown>(storageKey);
		if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.records)) return [];
		return raw.records.slice(-maxRecords).map(normalizeItem).filter((item): item is PracticeItem => item !== undefined);
	}

	onDidChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async add(candidate: PracticeCandidate): Promise<'added' | 'existing' | 'full' | 'invalid'> {
		if (!validTag(candidate.tag, candidate.category) || !validLanguage(candidate.languageId) ||
			!validId(candidate.goalEpoch) || (candidate.sourceRecordId && !validId(candidate.sourceRecordId))) return 'invalid';
		let result: 'added' | 'existing' | 'full' = 'full';
		await this.mutate(items => {
			if (items.some(item => isOpen(item) && item.goalEpoch === candidate.goalEpoch &&
				item.languageId === candidate.languageId && item.tag === candidate.tag)) {
				result = 'existing';
				return items;
			}
			if (items.filter(isOpen).length >= maxOpenItems || items.length >= maxRecords) return items;
			result = 'added';
			return [...items, { ...candidate, id: randomUUID(), createdAt: new Date().toISOString(), status: 'active' }];
		});
		return result;
	}

	async setStatus(id: string, status: PracticeStatus): Promise<void> {
		if (!validId(id) || !statuses.includes(status)) return;
		await this.mutate(items => items.map(item => item.id === id && isOpen(item) &&
			(item.status === 'active' || status !== 'paused') ? { ...item, status } : item));
	}

	async markPracticed(id: string): Promise<void> {
		if (!validId(id)) return;
		await this.mutate(items => items.map(item => item.id === id && item.status === 'active'
			? { ...item, lastPracticedAt: new Date().toISOString() } : item));
	}

	async delete(id: string): Promise<void> {
		if (!validId(id)) return;
		await this.mutate(items => items.filter(item => item.id !== id));
	}

	async clear(): Promise<void> {
		await this.mutate(() => []);
	}

	private async mutate(change: (items: PracticeItem[]) => PracticeItem[]): Promise<void> {
		const action = this.pending.then(async () => {
			const before = this.snapshot();
			const after = change(before);
			if (after === before) return;
			await this.storage.update(storageKey, { version: 1, records: after });
			for (const listener of this.listeners) listener();
		});
		this.pending = action.catch(() => undefined);
		await action;
	}
}

export function comparePractice(item: PracticeItem, memory: MemorySnapshot): PracticeComparison {
	const later = memory.records.filter(record => record.goalEpoch === item.goalEpoch &&
		record.languageId === item.languageId && record.createdAt > item.createdAt);
	const tagged = later.filter(record => record.observations.some(observation =>
		observation.feedback !== 'notApplicable' && observation.feedback !== 'notHelpful'));
	const matching = tagged.filter(record => record.observations.some(observation =>
		observation.tag === item.tag && observation.kind === 'suggestion' &&
		observation.feedback !== 'notApplicable' && observation.feedback !== 'notHelpful'));
	const strengths = tagged.filter(record => record.observations.some(observation =>
		observation.category === item.category && observation.kind === 'strength' &&
		observation.feedback !== 'notApplicable' && observation.feedback !== 'notHelpful'));
	const status: PracticeComparison['status'] = later.length === 0 ? 'no-later-reviews'
		: matching.length > 0 && strengths.length > 0 ? 'mixed'
			: matching.length >= 2 ? 'repeated'
				: matching.length === 1 ? 'seen-once'
					: tagged.length >= 2 ? 'not-observed' : 'limited';
	const examples = tagged.flatMap(record => {
		const kinds: ('suggestion' | 'strength')[] = [];
		if (matching.includes(record)) kinds.push('suggestion');
		if (strengths.includes(record)) kinds.push('strength');
		return kinds.map(kind => ({ recordId: record.id, date: record.createdAt.slice(0, 10), languageId: record.languageId, kind }));
	}).slice(-4);
	return {
		status, laterReviewCount: later.length, taggedReviewCount: tagged.length,
		matchingReviewCount: matching.length, strengthReviewCount: strengths.length,
		examples, sourceRetained: !!item.sourceRecordId && memory.records.some(record => record.id === item.sourceRecordId)
	};
}

export function practiceLabel(item: PracticeItem): string {
	return memoryTagLabel(item.tag, item.category);
}

export function practicePrompt(item: PracticeItem, depth: PracticeDepth): { exercise: string; selfCheck: string } {
	const concept = item.tag === 'local:javascript.eval-call'
		? 'replace a dynamic eval call with an explicit map of allowed operations'
		: item.tag === 'local:javascript.empty-catch'
			? 'handle an expected failure with a clear fallback or a deliberate rethrow'
			: categoryExercise[item.category];
	const area = areaLabels[item.category].toLowerCase();
	if (depth === 'beginner') return {
		exercise: `In a small scratch example, try to ${concept}. Keep it separate from your project code.`,
		selfCheck: `Can you explain what changed and why it helps ${area}?`
	};
	if (depth === 'advanced') return {
		exercise: `Design a small example that lets you ${concept}; compare a second approach and its trade-offs.`,
		selfCheck: `Which assumptions make your choice safe, and when would another approach be better for ${area}?`
	};
	return {
		exercise: `Try a small, standalone example to ${concept}, then compare it with the original approach.`,
		selfCheck: `What trade-off matters most here for ${area}, and how would you verify the change?`
	};
}

const categoryExercise: Record<MemoryCategory, string> = {
	correctness: 'make one edge case explicit and test the expected result',
	security: 'identify an input boundary and validate only the values you intend to accept',
	readability: 'rename or split one step so its intent is clear without extra comments',
	testing: 'write one focused test for an important behavior and one edge case',
	'error-handling': 'handle one expected failure with an explicit recovery path',
	architecture: 'separate one decision from the code that performs the work',
	performance: 'measure a small bottleneck before and after one targeted change',
	accessibility: 'make one interaction usable with a keyboard and a clear label'
};

function normalizeItem(raw: unknown): PracticeItem | undefined {
	if (!isRecord(raw) || !validId(raw.id) || typeof raw.category !== 'string' ||
		!categories.includes(raw.category as MemoryCategory) || !validTag(raw.tag, raw.category as MemoryCategory) ||
		!validLanguage(raw.languageId) || !validId(raw.goalEpoch) ||
		!validDate(raw.createdAt) || !statuses.includes(raw.status as PracticeStatus)) return undefined;
	return {
		id: raw.id, tag: raw.tag as string, category: raw.category as MemoryCategory,
		languageId: raw.languageId, goalEpoch: raw.goalEpoch, createdAt: new Date(raw.createdAt).toISOString(),
		status: raw.status as PracticeStatus,
		...(validDate(raw.lastPracticedAt) ? { lastPracticedAt: new Date(raw.lastPracticedAt).toISOString() } : {}),
		...(validId(raw.sourceRecordId) ? { sourceRecordId: raw.sourceRecordId } : {})
	};
}

function validTag(tag: unknown, category: MemoryCategory): tag is string {
	return typeof tag === 'string' &&
		((tag === 'local:javascript.eval-call' && category === 'security') ||
			(tag === 'local:javascript.empty-catch' && category === 'error-handling') ||
			tag === `provider:${category}:suggestion`);
}

function validId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
}

function validLanguage(value: unknown): value is string {
	return typeof value === 'string' && /^[a-zA-Z0-9+.#_-]{1,40}$/.test(value);
}

function validDate(value: unknown): value is string {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function isOpen(item: PracticeItem): boolean {
	return item.status === 'active' || item.status === 'paused';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
