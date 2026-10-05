import * as vscode from 'vscode';
import { analyzeCode } from './analyzer';
import {
	CoachingProfile,
	defaultCoachingProfile,
	hasCoachingProfile,
	normalizeCoachingProfile
} from './coachingProfile';
import { renderPanel, showReviewPanel } from './panel';
import { captureReviewContext, ReviewMode } from './reviewContext';

const profileStorageKey = 'devlens.coachingProfile';
const profileEnabledKey = 'devlens.coachingProfileEnabled';
const profilePromptedKey = 'devlens.coachingProfilePrompted';

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('devlens.reviewCurrentFile', () => review(context, 'file')),
		vscode.commands.registerCommand('devlens.reviewSelection', () => review(context, 'selection')),
		vscode.commands.registerCommand('devlens.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:devlens.devlens')
		),
		vscode.commands.registerCommand('devlens.configureCoachingProfile', () => configureCoachingProfile(context)),
		vscode.commands.registerCommand('devlens.toggleCoachingProfile', () => toggleCoachingProfile(context)),
		vscode.commands.registerCommand('devlens.clearCoachingProfile', () => clearCoachingProfile(context))
	);
}

async function review(extensionContext: vscode.ExtensionContext, mode: ReviewMode): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		showReviewPanel({ kind: 'error', message: 'Open a code or text file before starting a review.' });
		return;
	}

	await offerProfileSetup(extensionContext);
	const profile = readProfile(extensionContext);
	const profileEnabled = extensionContext.globalState.get<boolean>(profileEnabledKey, true);
	const panel = showReviewPanel({ kind: 'loading', message: 'Preparing code for review…' });
	const result = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Preparing DevLens review', cancellable: true },
		async (progress, token) => {
			progress.report({ message: 'Finding the selected code unit…' });
			await new Promise<void>(resolve => setTimeout(resolve, 40));
			if (token.isCancellationRequested) return undefined;
			return captureReviewContext(editor.document, editor.selection, mode);
		}
	);
	if (!result) {
		panel.dispose();
		return;
	}
	if (!result.ok) {
		panel.title = 'DevLens Review · Needs attention';
		panel.webview.html = renderPanel({ kind: 'error', message: result.message });
		return;
	}

	const analysis = analyzeCode(result.context.languageId, result.context.code);
	panel.title = 'DevLens Review';
	panel.webview.html = renderPanel({ kind: 'ready', context: result.context, analysis, coachingProfile: profile, profileEnabled });
}

async function offerProfileSetup(context: vscode.ExtensionContext): Promise<void> {
	if (context.globalState.get<boolean>(profilePromptedKey, false)) return;
	await context.globalState.update(profilePromptedKey, true);
	if (hasCoachingProfile(readProfile(context))) return;
	void vscode.window.showInformationMessage(
		'Tell DevLens what kind of coaching you want. You can skip this and change it any time.',
		'Set up profile',
		'Skip for now'
	).then(choice => choice === 'Set up profile' ? configureCoachingProfile(context) : undefined);
}

async function configureCoachingProfile(context: vscode.ExtensionContext): Promise<void> {
	const current = readProfile(context);
	const level = await vscode.window.showQuickPick([
		{ label: 'Beginner', value: 'beginner' as const, description: 'More foundational explanations and smaller steps.' },
		{ label: 'Mid-level', value: 'midLevel' as const, description: 'Focus on trade-offs and maintainability.' },
		{ label: 'Senior', value: 'senior' as const, description: 'Emphasize design, reliability, and broader consequences.' },
		{ label: 'Prefer not to say', value: 'unspecified' as const, description: 'Use a balanced explanation by default.' }
	], { placeHolder: 'How should DevLens tailor its explanations?' });
	if (!level) return;

	const currentRole = await vscode.window.showInputBox({
		prompt: 'What is your current role? This is optional and only used to tailor coaching.',
		placeHolder: 'For example, frontend developer',
		value: current.currentRole,
		validateInput: value => value.length > 120 ? 'Keep this to 120 characters or fewer.' : undefined,
		ignoreFocusOut: true
	});
	if (currentRole === undefined) return;

	const targetRole = await vscode.window.showInputBox({
		prompt: 'What role or direction are you working toward? This is optional.',
		placeHolder: 'For example, backend engineer',
		value: current.targetRole,
		validateInput: value => value.length > 120 ? 'Keep this to 120 characters or fewer.' : undefined,
		ignoreFocusOut: true
	});
	if (targetRole === undefined) return;

	const improvementGoal = await vscode.window.showInputBox({
		prompt: 'What would you most like to improve right now? This is optional.',
		placeHolder: 'For example, testing or error handling',
		value: current.improvementGoal,
		validateInput: value => value.length > 240 ? 'Keep this to 240 characters or fewer.' : undefined,
		ignoreFocusOut: true
	});
	if (improvementGoal === undefined) return;

	const lens = await vscode.window.showQuickPick([
		{ label: 'Current level', value: 'currentLevel' as const, description: 'Keep advice aligned with your selected experience.' },
		{ label: 'Stretch me', value: 'stretch' as const, description: 'Include a more ambitious next-step perspective.' }
	], { placeHolder: 'Choose your review lens' });
	if (!lens) return;

	const profile: CoachingProfile = normalizeCoachingProfile({
		experienceLevel: level.value,
		currentRole,
		targetRole,
		improvementGoal,
		reviewLens: lens.value
	});
	await context.globalState.update(profileStorageKey, profile);
	await context.globalState.update(profileEnabledKey, true);
	await context.globalState.update(profilePromptedKey, true);
	vscode.window.showInformationMessage('DevLens coaching profile saved locally. You can edit or clear it from the Command Palette.');
}

async function toggleCoachingProfile(context: vscode.ExtensionContext): Promise<void> {
	const enabled = context.globalState.get<boolean>(profileEnabledKey, true);
	await context.globalState.update(profileEnabledKey, !enabled);
	vscode.window.showInformationMessage(`DevLens coaching profile ${enabled ? 'disabled' : 'enabled'} for reviews.`);
}

async function clearCoachingProfile(context: vscode.ExtensionContext): Promise<void> {
	const choice = await vscode.window.showWarningMessage(
		'Clear your locally stored DevLens coaching profile?',
		{ modal: true },
		'Clear profile'
	);
	if (choice !== 'Clear profile') return;
	await context.globalState.update(profileStorageKey, defaultCoachingProfile);
	await context.globalState.update(profileEnabledKey, true);
	await context.globalState.update(profilePromptedKey, true);
	vscode.window.showInformationMessage('DevLens coaching profile cleared.');
}

function readProfile(context: vscode.ExtensionContext): CoachingProfile {
	return normalizeCoachingProfile(context.globalState.get<unknown>(profileStorageKey));
}

export function deactivate(): void {}
