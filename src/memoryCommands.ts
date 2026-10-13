import * as vscode from 'vscode';
import { MemoryRecord, MentorMemoryStore } from './mentorMemory';

type MemoryAction = 'enable' | 'disable' | 'pause' | 'inspect' | 'retention' | 'reset' | 'clear' | 'goal';

export async function manageMentorMemory(store: MentorMemoryStore, changeGoal: () => Promise<void>): Promise<void> {
	const snapshot = store.snapshot();
	const actions: { label: string; description: string; value: MemoryAction }[] = snapshot.settings.enabled
		? [
			{ label: snapshot.settings.paused ? 'Resume mentor memory' : 'Pause mentor memory', description: 'Pause also stops memory from changing review order.', value: 'pause' },
			{ label: 'Inspect or delete a review record', description: `${snapshot.records.length} local records; no source code is stored.`, value: 'inspect' },
			{ label: 'Set retention limit', description: `Keep up to ${snapshot.settings.retentionLimit} reviews (1–100).`, value: 'retention' },
			{ label: 'Reset focus and feedback', description: 'Clear current-goal focus choices and saved feedback; retain records.', value: 'reset' },
			{ label: 'My goal changed', description: 'Start a fresh focus context while keeping old records inspectable.', value: 'goal' },
			{ label: 'Clear all review records', description: 'Permanently delete DevLens history from this VS Code profile.', value: 'clear' },
			{ label: 'Turn off mentor memory', description: 'Stop saving and adapting; retain existing records until you delete them.', value: 'disable' }
		]
		: [
			{ label: 'Enable mentor memory', description: 'Save finding tags, dates, language IDs, and feedback locally; never source text.', value: 'enable' },
			{ label: 'Inspect or delete saved records', description: `${snapshot.records.length} local records.`, value: 'inspect' },
			{ label: 'Clear all review records', description: 'Delete any previously saved history.', value: 'clear' }
		];
	const choice = await vscode.window.showQuickPick(actions, { placeHolder: 'DevLens mentor memory is local and off until you enable it.' });
	if (!choice) return;
	switch (choice.value) {
		case 'enable': {
			const consent = await vscode.window.showInformationMessage(
				'DevLens will save review dates, language IDs, finding tags, and your feedback in this VS Code profile. No code, excerpts, filenames, keys, or profile text are saved. You can pause, inspect, delete, or clear records at any time. Memory only changes the order of later review cards; it is never sent to OpenAI.',
				{ modal: true }, 'Enable mentor memory'
			);
			if (consent === 'Enable mentor memory') await store.enable();
			break;
		}
		case 'disable': await store.disable(); break;
		case 'pause': await store.togglePause(); break;
		case 'inspect': await inspectRecords(store); break;
		case 'retention': await chooseRetention(store); break;
		case 'reset': {
			const confirmed = await vscode.window.showWarningMessage(
				'Clear current-goal focus choices and saved helpful/not-helpful/not-applicable feedback? Review records will remain.',
				{ modal: true }, 'Reset focus and feedback'
			);
			if (confirmed === 'Reset focus and feedback') await store.resetAdaptation();
			break;
		}
		case 'goal': await changeGoal(); break;
		case 'clear': {
			const confirmed = await vscode.window.showWarningMessage(
				'Delete all locally retained DevLens review records? This cannot be undone.',
				{ modal: true }, 'Delete all records'
			);
			if (confirmed === 'Delete all records') await store.clear();
			break;
		}
	}
}

async function chooseRetention(store: MentorMemoryStore): Promise<void> {
	const value = await vscode.window.showInputBox({
		prompt: 'Maximum number of local review records to keep (1–100). Older records are deleted immediately when you lower the limit.',
		value: String(store.snapshot().settings.retentionLimit),
		validateInput: input => /^\d+$/.test(input) && Number(input) >= 1 && Number(input) <= 100 ? undefined : 'Enter a whole number from 1 to 100.'
	});
	if (value !== undefined) await store.setRetentionLimit(Number(value));
}

async function inspectRecords(store: MentorMemoryStore): Promise<void> {
	const records = [...store.snapshot().records].reverse();
	if (records.length === 0) {
		vscode.window.showInformationMessage('DevLens has no saved review records.');
		return;
	}
	const choices = records.map(record => ({
		label: `${record.createdAt.slice(0, 16).replace('T', ' ')} UTC · ${record.languageId}`,
		description: `${record.observations.length} tagged observation${record.observations.length === 1 ? '' : 's'}`,
		record
	}));
	const selected = await vscode.window.showQuickPick(choices, { placeHolder: 'Select a saved review to inspect its metadata or delete it.' });
	if (!selected) return;
	await inspectRecord(store, selected.record);
}

async function inspectRecord(store: MentorMemoryStore, record: MemoryRecord): Promise<void> {
	const summary = record.observations.length
		? record.observations.map(observation => `${observation.category} ${observation.kind}${observation.feedback ? ` (${observation.feedback})` : ''}`).join(', ')
		: 'No tagged observations';
	const choice = await vscode.window.showInformationMessage(
		`Review ${record.createdAt.slice(0, 16).replace('T', ' ')} UTC, ${record.languageId}: ${summary}. No source text or filename is retained.`,
		'Delete this record'
	);
	if (choice !== 'Delete this record') return;
	const confirmed = await vscode.window.showWarningMessage('Delete this DevLens review record?', { modal: true }, 'Delete record');
	if (confirmed === 'Delete record') await store.deleteRecord(record.id);
}

export async function inspectSavedReview(store: MentorMemoryStore, recordId: string): Promise<void> {
	const record = store.snapshot().records.find(item => item.id === recordId);
	if (record) await inspectRecord(store, record);
}
