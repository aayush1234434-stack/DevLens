import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { inspectSavedReview } from './memoryCommands';
import { MentorMemoryStore } from './mentorMemory';
import { buildSkillProfile, SkillProfilePreferences } from './skillProfile';
import { renderSkillProfileHtml } from './skillProfileView';

type ProfileAction = 'show' | 'hide' | 'reset' | 'restore' | 'clear' | 'inspect' | 'manageMemory';

export class SkillProfilePanel {
	private panel: vscode.WebviewPanel | undefined;
	private unsubscribeMemory: (() => void) | undefined;

	constructor(
		private readonly memory: MentorMemoryStore,
		private readonly preferences: SkillProfilePreferences,
		private readonly getGoal: () => string
	) {}

	open(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside);
			this.refresh();
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			'devlens.skillProfile', 'DevLens Skill Profile', vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: false }
		);
		this.panel = panel;
		const messages = panel.webview.onDidReceiveMessage(message => {
			void this.handleMessage(message).catch(() =>
				vscode.window.showErrorMessage('DevLens could not update the local skill profile.')
			);
		});
		this.unsubscribeMemory = this.memory.onDidChange(() => this.refresh());
		panel.onDidDispose(() => {
			messages.dispose();
			this.unsubscribeMemory?.();
			this.unsubscribeMemory = undefined;
			this.panel = undefined;
		});
		this.refresh();
	}

	refresh(): void {
		if (!this.panel) return;
		const goal = this.getGoal();
		const profile = buildSkillProfile(this.memory.snapshot(), this.preferences.snapshot(), goal);
		this.panel.webview.html = renderSkillProfileHtml(profile, goal, randomBytes(16).toString('base64'));
	}

	private async handleMessage(raw: unknown): Promise<void> {
		if (!isRecord(raw) || typeof raw.action !== 'string' ||
			!['show', 'hide', 'reset', 'restore', 'clear', 'inspect', 'manageMemory'].includes(raw.action)) return;
		const action = raw.action as ProfileAction;
		if (action === 'show' || action === 'hide') {
			await this.preferences.setHidden(action === 'hide');
		} else if (action === 'reset') {
			await this.preferences.reset();
		} else if (action === 'restore') {
			await this.preferences.includeEarlierReviews();
		} else if (action === 'clear') {
			const count = this.memory.snapshot().records.filter(record => record.goalEpoch === this.memory.snapshot().settings.goalEpoch).length;
			const confirmed = await vscode.window.showWarningMessage(
				`Delete ${count} current-goal review record${count === 1 ? '' : 's'}? This also removes their feedback and examples from mentor memory. Earlier-goal records remain.`,
				{ modal: true }, 'Delete current-goal records'
			);
			if (confirmed === 'Delete current-goal records') await this.memory.clearCurrentGoal();
		} else if (action === 'inspect') {
			if (typeof raw.recordId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(raw.recordId)) return;
			await inspectSavedReview(this.memory, raw.recordId);
		} else if (action === 'manageMemory') {
			await vscode.commands.executeCommand('devlens.manageMentorMemory');
		}
		this.refresh();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
