import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { inspectSavedReview } from './memoryCommands';
import { MentorMemoryStore } from './mentorMemory';
import { comparePractice, PracticeDepth, PracticeStore } from './practiceLoop';
import { renderPracticeHtml } from './practiceView';

type PracticeAction = 'practiced' | 'pause' | 'resume' | 'complete' | 'notRelevant' |
	'delete' | 'clear' | 'inspect' | 'inspectLater' | 'skillProfile' | 'manageMemory' | 'reviewSelection';

export class PracticePanel {
	private panel: vscode.WebviewPanel | undefined;
	private unsubscribes: (() => void)[] = [];

	constructor(private readonly practice: PracticeStore, private readonly memory: MentorMemoryStore) {}

	open(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside);
			this.refresh();
			return;
		}
		const panel = vscode.window.createWebviewPanel('devlens.practiceQueue', 'DevLens Practice Queue',
			vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: false });
		this.panel = panel;
		const messages = panel.webview.onDidReceiveMessage(message => {
			void this.handleMessage(message).catch(() =>
				vscode.window.showErrorMessage('DevLens could not update the local practice queue.'));
		});
		this.unsubscribes = [this.practice.onDidChange(() => this.refresh()), this.memory.onDidChange(() => this.refresh())];
		panel.onDidDispose(() => {
			messages.dispose();
			for (const unsubscribe of this.unsubscribes) unsubscribe();
			this.unsubscribes = [];
			this.panel = undefined;
		});
		this.refresh();
	}

	refresh(): void {
		if (!this.panel) return;
		const depth = vscode.workspace.getConfiguration('devlens').get<string>('explanationLevel', 'intermediate');
		const safeDepth: PracticeDepth = depth === 'beginner' || depth === 'advanced' ? depth : 'intermediate';
		this.panel.webview.html = renderPracticeHtml(this.practice.snapshot(), this.memory.snapshot(),
			safeDepth, randomBytes(16).toString('base64'));
	}

	private async handleMessage(raw: unknown): Promise<void> {
		if (!isRecord(raw) || typeof raw.action !== 'string' ||
			!['practiced', 'pause', 'resume', 'complete', 'notRelevant', 'delete', 'clear', 'inspect',
				'inspectLater', 'skillProfile', 'manageMemory', 'reviewSelection'].includes(raw.action)) return;
		const action = raw.action as PracticeAction;
		if (action === 'reviewSelection') {
			await vscode.commands.executeCommand('devlens.reviewSelection');
			return;
		}
		if (action === 'skillProfile') {
			await vscode.commands.executeCommand('devlens.openSkillProfile');
			return;
		}
		if (action === 'manageMemory') {
			await vscode.commands.executeCommand('devlens.manageMentorMemory');
			return;
		}
		if (action === 'clear') {
			const confirmed = await vscode.window.showWarningMessage(
				'Delete all locally saved DevLens practice cards? Mentor review records will not be changed.',
				{ modal: true }, 'Delete all practice cards');
			if (confirmed === 'Delete all practice cards') await this.practice.clear();
			return;
		}
		if (typeof raw.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(raw.id)) return;
		if (action === 'inspectLater') {
			const snapshot = this.memory.snapshot();
			const referenced = this.practice.snapshot().some(item =>
				comparePractice(item, snapshot).examples.some(example => example.recordId === raw.id));
			if (referenced) await inspectSavedReview(this.memory, raw.id);
			return;
		}
		const item = this.practice.snapshot().find(candidate => candidate.id === raw.id);
		if (!item) return;
		if (action === 'inspect') {
			if (item.sourceRecordId) await inspectSavedReview(this.memory, item.sourceRecordId);
		} else if (action === 'practiced' && item.status === 'active') {
			await this.practice.markPracticed(item.id);
		} else if (action === 'pause' && item.status === 'active') {
			await this.practice.setStatus(item.id, 'paused');
		} else if (action === 'resume' && item.status === 'paused') {
			await this.practice.setStatus(item.id, 'active');
		} else if ((action === 'complete' || action === 'notRelevant') &&
			(item.status === 'active' || item.status === 'paused')) {
			await this.practice.setStatus(item.id, action === 'complete' ? 'completed' : 'notRelevant');
		} else if (action === 'delete') {
			await this.practice.delete(item.id);
		}
		this.refresh();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
