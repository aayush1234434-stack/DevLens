import * as vscode from 'vscode';
import { analyzeCode } from './analyzer';
import {
	CoachingProfile,
	defaultCoachingProfile,
	hasCoachingProfile,
	normalizeCoachingProfile
} from './coachingProfile';
import { PanelState, renderPanel, showReviewPanel } from './panel';
import { categoryPriority, MemoryFeedback, MentorMemoryStore, prioritizeByMemory } from './mentorMemory';
import { manageMentorMemory } from './memoryCommands';
import { normalizeOpenAIModel, OpenAIResponsesProvider } from './openAiProvider';
import { requestMentorReview } from './mentorReviewService';
import { buildOpenAIDisclosure } from './reviewDisclosure';
import { captureReviewContext, ReviewContext, ReviewMode } from './reviewContext';
import { SkillProfilePreferences } from './skillProfile';
import { SkillProfilePanel } from './skillProfilePanel';

const profileStorageKey = 'devlens.coachingProfile';
const profileEnabledKey = 'devlens.coachingProfileEnabled';
const profilePromptedKey = 'devlens.coachingProfilePrompted';
const openAiApiKeySecret = 'devlens.openai.apiKey';

export function activate(context: vscode.ExtensionContext): void {
	const memory = new MentorMemoryStore(context.globalState);
	const skillProfile = new SkillProfilePanel(
		memory,
		new SkillProfilePreferences(context.globalState),
		() => context.globalState.get<boolean>(profileEnabledKey, true) ? readProfile(context).improvementGoal : ''
	);
	void memory.initialize().catch(() => vscode.window.showErrorMessage('DevLens could not migrate local mentor memory.'));
	context.subscriptions.push(
		vscode.commands.registerCommand('devlens.reviewCurrentFile', () => review(context, memory, 'file')),
		vscode.commands.registerCommand('devlens.reviewSelection', () => review(context, memory, 'selection')),
		vscode.commands.registerCommand('devlens.openSettings', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:devlens.devlens')
		),
		vscode.commands.registerCommand('devlens.configureCoachingProfile', async () => { await configureCoachingProfile(context, memory); skillProfile.refresh(); }),
		vscode.commands.registerCommand('devlens.toggleCoachingProfile', async () => { await toggleCoachingProfile(context); skillProfile.refresh(); }),
		vscode.commands.registerCommand('devlens.clearCoachingProfile', async () => { await clearCoachingProfile(context, memory); skillProfile.refresh(); }),
		vscode.commands.registerCommand('devlens.setOpenAIKey', () => setOpenAIKey(context)),
		vscode.commands.registerCommand('devlens.removeOpenAIKey', () => removeOpenAIKey(context)),
		vscode.commands.registerCommand('devlens.toggleOpenAIReviews', () => toggleOpenAIReviews()),
		vscode.commands.registerCommand('devlens.manageMentorMemory', () => manageMentorMemory(memory, () => changeGoal(context, memory))),
		vscode.commands.registerCommand('devlens.openSkillProfile', () => skillProfile.open())
	);
}

async function review(extensionContext: vscode.ExtensionContext, memory: MentorMemoryStore, mode: ReviewMode): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		showReviewPanel({ kind: 'error', message: 'Open a code or text file before starting a review.' });
		return;
	}

	await offerProfileSetup(extensionContext, memory);
	const profile = readProfile(extensionContext);
	const profileEnabled = extensionContext.globalState.get<boolean>(profileEnabledKey, true);
	let panelState: PanelState = { kind: 'loading', message: 'Preparing code for review…' };
	const dismissed = new Set<string>();
	let recordId: string | undefined;
	let panel!: vscode.WebviewPanel;
	const updatePanel = (next: PanelState) => {
		const snapshot = memory.snapshot();
		const record = snapshot.records.find(item => item.id === recordId);
		const observationFeedback = Object.fromEntries(
			(record?.observations ?? []).filter(item => item.feedback).map(item => [item.id, item.feedback])
		) as Record<string, MemoryFeedback>;
		panelState = next.kind === 'ready'
			? { ...next, memory: snapshot, observationFeedback, dismissedObservationIds: [...dismissed] }
			: next;
		panel.title = panelState.kind === 'error' ? 'DevLens Review · Needs attention' : 'DevLens Review';
		panel.webview.html = renderPanel(panelState);
	};
	panel = showReviewPanel(panelState, (action, id) => {
		void (async () => {
			if (action === 'openSkillProfile') {
				await vscode.commands.executeCommand('devlens.openSkillProfile');
				return;
			}
			if (action === 'manageMemory') {
				await vscode.commands.executeCommand('devlens.manageMentorMemory');
				return;
			}
			if (!id || panelState.kind !== 'ready') return;
			const local = panelState.analysis.findings.map((finding, index) => ({ id: `local-${index}`, category: finding.category }));
			const remote = [...(panelState.mentorReview?.strengths ?? []), ...(panelState.mentorReview?.suggestions ?? [])];
			const observation = [...local, ...remote].find(item => item.id === id);
			if (!observation) return;
			if (action === 'notApplicable') {
				dismissed.add(id);
				await memory.setFeedback(recordId, id, 'notApplicable');
			} else if (action === 'helpful' || action === 'notHelpful') {
				await memory.setFeedback(recordId, id, action);
			} else if (action === 'focus' || action === 'less') {
				await memory.setPreference(observation.category, action);
			}
			updatePanel(panelState);
		})().catch(() => vscode.window.showErrorMessage('DevLens could not update mentor memory. No review source was saved.'));
	});
	const unsubscribe = memory.onDidChange(() => { if (panelState.kind === 'ready') updatePanel(panelState); });
	panel.onDidDispose(unsubscribe);
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
		updatePanel({ kind: 'error', message: result.message });
		return;
	}

	const analysis = analyzeCode(result.context.languageId, result.context.code,
		category => categoryPriority(memory.snapshot(), category));
	recordId = await memory.startReview(result.context.languageId, analysis);
	panelState = {
		kind: 'ready', context: result.context, analysis, coachingProfile: profile, profileEnabled,
		providerStatus: 'disabled', dismissedObservationIds: []
	};
	updatePanel(panelState);
	if (vscode.workspace.getConfiguration('devlens').get<boolean>('allowOpenAIReview', false)) {
		await reviewWithOpenAI(extensionContext, result.context, profile, profileEnabled, analysis, memory, recordId, updatePanel);
	}
}

async function reviewWithOpenAI(
	context: vscode.ExtensionContext,
	reviewContext: ReviewContext,
	profile: CoachingProfile,
	profileEnabled: boolean,
	analysis: ReturnType<typeof analyzeCode>,
	memory: MentorMemoryStore,
	recordId: string | undefined,
	updatePanel: (state: PanelState) => void
): Promise<void> {
	const apiKey = await context.secrets.get(openAiApiKeySecret);
	if (!apiKey) {
		updatePanel({
			kind: 'ready', context: reviewContext, analysis, coachingProfile: profile, profileEnabled,
			providerStatus: 'not-configured',
			providerMessage: 'OpenAI reviews are enabled, but no API key is configured. Use DevLens: Set OpenAI API Key. Your review stayed local.'
		});
		return;
	}

	const config = vscode.workspace.getConfiguration('devlens');
	const level = config.get<string>('explanationLevel', 'intermediate');
	const style = config.get<string>('explanationStyle', 'concise');
	const model = normalizeOpenAIModel(config.get<unknown>('openAIModel'));
	const selectedProfile = profileEnabled ? profile : undefined;
	const disclosure = buildOpenAIDisclosure(reviewContext, selectedProfile, level, style, model);
	const consent = await vscode.window.showWarningMessage(
		disclosure,
		{ modal: true },
		'Send this review to OpenAI',
		'Keep this review local'
	);
	if (consent !== 'Send this review to OpenAI') {
		updatePanel({
			kind: 'ready', context: reviewContext, analysis, coachingProfile: profile, profileEnabled,
			providerStatus: 'declined', providerMessage: 'No code was sent. Your local review is still available.'
		});
		return;
	}

	updatePanel({
		kind: 'ready', context: reviewContext, analysis, coachingProfile: profile, profileEnabled,
		providerStatus: 'pending', providerMessage: 'Sending the disclosed review to OpenAI…'
	});
	const controller = new AbortController();
	try {
		const mentorReview = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'DevLens · OpenAI mentor review', cancellable: true },
			async (progress, token) => {
				progress.report({ message: 'OpenAI will receive only the code and coaching context shown in the consent prompt.' });
				const cancellation = token.onCancellationRequested(() => controller.abort());
				try {
					return await requestMentorReview({
						enabled: vscode.workspace.getConfiguration('devlens').get<boolean>('allowOpenAIReview', false),
						consentGranted: true,
						apiKey,
						input: {
							languageId: reviewContext.languageId,
							code: reviewContext.code,
							...(selectedProfile ? { profile: selectedProfile } : {}),
							explanationLevel: level,
							explanationStyle: style
						},
						localAnalysis: analysis,
						provider: new OpenAIResponsesProvider(fetch, model),
						signal: controller.signal
					});
				} finally {
					cancellation.dispose();
				}
			}
		);
		if (!mentorReview) throw new Error('No remote review was requested. Your local findings are still available.');
		await memory.appendProviderReview(recordId, mentorReview);
		const snapshot = memory.snapshot();
		const orderedReview = {
			...mentorReview,
			strengths: prioritizeByMemory(mentorReview.strengths, snapshot),
			suggestions: prioritizeByMemory(mentorReview.suggestions, snapshot)
		};
		updatePanel({
			kind: 'ready', context: reviewContext, analysis, coachingProfile: profile, profileEnabled,
			providerStatus: 'completed', mentorReview: orderedReview,
			providerMessage: 'OpenAI-assisted suggestions were checked against exact source excerpts. You can give feedback on each card.'
		});
	} catch (error) {
		updatePanel({
			kind: 'ready', context: reviewContext, analysis, coachingProfile: profile, profileEnabled,
			providerStatus: 'failed',
			providerMessage: error instanceof Error ? error.message : 'OpenAI review failed. Your local findings are still available.'
		});
	}
}

async function setOpenAIKey(context: vscode.ExtensionContext): Promise<void> {
	const value = await vscode.window.showInputBox({
		prompt: 'Paste your OpenAI API key. It will be stored in VS Code SecretStorage, not settings or source.',
		password: true,
		ignoreFocusOut: true,
		validateInput: input => input.trim().length < 10 || input.length > 512 ? 'Enter a valid API key (10–512 characters).' : undefined
	});
	if (value === undefined) return;
	await context.secrets.store(openAiApiKeySecret, value.trim());
	vscode.window.showInformationMessage('OpenAI API key saved in VS Code SecretStorage. Remote reviews are off by default; enable “Allow OpenAI Reviews” in DevLens Settings. Each send still requires confirmation.');
}

async function toggleOpenAIReviews(): Promise<void> {
	const config = vscode.workspace.getConfiguration('devlens');
	const currentlyEnabled = config.get<boolean>('allowOpenAIReview', false);
	if (currentlyEnabled) {
		await config.update('allowOpenAIReview', false, vscode.ConfigurationTarget.Global);
		vscode.window.showInformationMessage('OpenAI reviews disabled. DevLens will keep reviews local.');
		return;
	}
	const choice = await vscode.window.showWarningMessage(
		'Allow DevLens to offer OpenAI reviews? Before every request, DevLens will show the code scope and coaching preferences that would be sent. Nothing is sent until you confirm that review.',
		{ modal: true },
		'Allow OpenAI reviews'
	);
	if (choice !== 'Allow OpenAI reviews') return;
	await config.update('allowOpenAIReview', true, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage('OpenAI reviews are enabled. DevLens will still ask before every code upload.');
}

async function removeOpenAIKey(context: vscode.ExtensionContext): Promise<void> {
	const choice = await vscode.window.showWarningMessage(
		'Remove the OpenAI API key stored by DevLens?', { modal: true }, 'Remove key'
	);
	if (choice !== 'Remove key') return;
	await context.secrets.delete(openAiApiKeySecret);
	vscode.window.showInformationMessage('DevLens OpenAI API key removed.');
}

async function offerProfileSetup(context: vscode.ExtensionContext, memory: MentorMemoryStore): Promise<void> {
	if (context.globalState.get<boolean>(profilePromptedKey, false)) return;
	await context.globalState.update(profilePromptedKey, true);
	if (hasCoachingProfile(readProfile(context))) return;
	void vscode.window.showInformationMessage(
		'Tell DevLens what kind of coaching you want. You can skip this and change it any time.',
		'Set up profile',
		'Skip for now'
	).then(choice => choice === 'Set up profile' ? configureCoachingProfile(context, memory) : undefined);
}

async function configureCoachingProfile(context: vscode.ExtensionContext, memory: MentorMemoryStore): Promise<void> {
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
	if (profile.improvementGoal !== current.improvementGoal) await memory.goalChanged();
	await context.globalState.update(profileEnabledKey, true);
	await context.globalState.update(profilePromptedKey, true);
	vscode.window.showInformationMessage('DevLens coaching profile saved locally. You can edit or clear it from the Command Palette.');
}

async function changeGoal(context: vscode.ExtensionContext, memory: MentorMemoryStore): Promise<void> {
	const current = readProfile(context);
	const improvementGoal = await vscode.window.showInputBox({
		prompt: 'What is your current improvement goal? Changing it starts a fresh mentor-memory focus context; old records remain inspectable.',
		value: current.improvementGoal,
		validateInput: value => value.length > 240 ? 'Keep this to 240 characters or fewer.' : undefined
	});
	if (improvementGoal === undefined) return;
	const next = normalizeCoachingProfile({ ...current, improvementGoal });
	if (next.improvementGoal === current.improvementGoal) return;
	await context.globalState.update(profileStorageKey, next);
	await memory.goalChanged();
	vscode.window.showInformationMessage('DevLens goal updated. Earlier review records remain available, but no longer influence current focus.');
}

async function toggleCoachingProfile(context: vscode.ExtensionContext): Promise<void> {
	const enabled = context.globalState.get<boolean>(profileEnabledKey, true);
	await context.globalState.update(profileEnabledKey, !enabled);
	vscode.window.showInformationMessage(`DevLens coaching profile ${enabled ? 'disabled' : 'enabled'} for reviews.`);
}

async function clearCoachingProfile(context: vscode.ExtensionContext, memory: MentorMemoryStore): Promise<void> {
	const choice = await vscode.window.showWarningMessage(
		'Clear your locally stored DevLens coaching profile?',
		{ modal: true },
		'Clear profile'
	);
	if (choice !== 'Clear profile') return;
	const hadGoal = readProfile(context).improvementGoal.length > 0;
	await context.globalState.update(profileStorageKey, defaultCoachingProfile);
	if (hadGoal) await memory.goalChanged();
	await context.globalState.update(profileEnabledKey, true);
	await context.globalState.update(profilePromptedKey, true);
	vscode.window.showInformationMessage('DevLens coaching profile cleared.');
}

function readProfile(context: vscode.ExtensionContext): CoachingProfile {
	return normalizeCoachingProfile(context.globalState.get<unknown>(profileStorageKey));
}

export function deactivate(): void {}
