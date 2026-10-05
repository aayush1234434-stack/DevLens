import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { AnalysisResult } from './analyzer';
import { CoachingProfile } from './coachingProfile';
import { MentorObservation, MentorReview } from './mentorReview';
import { ReviewContext } from './reviewContext';

export type ProviderStatus = 'disabled' | 'not-configured' | 'declined' | 'pending' | 'completed' | 'failed';

export type PanelState =
	| { kind: 'loading'; message: string }
	| { kind: 'error'; message: string }
	| {
		kind: 'ready';
		context: ReviewContext;
		analysis: AnalysisResult;
		coachingProfile: CoachingProfile;
		profileEnabled: boolean;
		mentorReview?: MentorReview;
		providerMessage?: string;
		providerStatus?: ProviderStatus;
		dismissedObservationIds?: readonly string[];
	};

export function showReviewPanel(state: PanelState, onNotApplicable?: (id: string) => boolean): vscode.WebviewPanel {
	const panel = vscode.window.createWebviewPanel(
		'devlens.review',
		'DevLens Review',
		vscode.ViewColumn.Beside,
		{ enableScripts: true, retainContextWhenHidden: false }
	);
	panel.webview.html = renderPanel(state);
	if (onNotApplicable) {
		const messages = panel.webview.onDidReceiveMessage(message => {
			if (!isRecord(message) || message.action !== 'notApplicable' || typeof message.id !== 'string') return;
			if (/^openai-(strength|suggestion)-\d+$/.test(message.id)) onNotApplicable(message.id);
		});
		panel.onDidDispose(() => messages.dispose());
	}
	return panel;
}

export function renderPanel(state: PanelState): string {
	const nonce = randomBytes(16).toString('base64');
	const body = state.kind === 'loading'
		? `<p class="status" role="status">${escapeHtml(state.message)}</p>`
		: state.kind === 'error'
			? `<p class="status error" role="alert">${escapeHtml(state.message)}</p>`
			: `<p class="status" role="status">${analysisSummary(state.analysis, state.context.languageId)}</p>
${renderFindings(state.analysis.findings, state.context.startLine)}
${renderProviderReview(state)}
<section class="coaching" aria-labelledby="coaching-heading">
<h2 id="coaching-heading">Coaching context</h2>
${renderCoachingProfile(state.coachingProfile, state.profileEnabled)}
</section>
<p class="meta">${escapeHtml(state.context.fileName)} · ${escapeHtml(state.context.languageId)} · ${scopeLabel(state.context.scope)} ${state.context.startLine + 1}–${state.context.endLine + 1}</p>
${state.context.truncated ? '<p class="notice" role="status">Review context was shortened at a line boundary (maximum 50,000 characters).</p>' : ''}
<pre><code>${escapeHtml(state.context.code)}</code></pre>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DevLens Review</title>
<style>
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 0 1rem 1rem; }
h1 { font-size: 1.25rem; font-weight: 600; }
h2 { font-size: 1rem; font-weight: 600; margin: 0 0 .5rem; }
.status { padding: .75rem; border-left: 3px solid var(--vscode-textLink-foreground); background: var(--vscode-textBlockQuote-background); }
.error { border-color: var(--vscode-errorForeground); }
.meta { color: var(--vscode-descriptionForeground); font-size: .9rem; }
.coaching { margin: 1rem 0; padding: .8rem; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
.coaching p { margin: .25rem 0; }
.notice { color: var(--vscode-editorWarning-foreground); }
.finding { margin: 1rem 0; padding: .9rem; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
.finding h2 { margin-bottom: .4rem; }
.finding p { line-height: 1.45; }
.finding pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: .5rem 0; padding: .65rem; }
.badge { color: var(--vscode-descriptionForeground); font-size: .85rem; }
.provider { margin: 1rem 0; padding: .9rem; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
.provider button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: .4rem .75rem; cursor: pointer; }
.provider button:hover { background: var(--vscode-button-hoverBackground); }
.provider details { margin-top: .5rem; }
.provider summary, .provider button { margin-top: .4rem; }
pre { overflow: auto; padding: 1rem; background: var(--vscode-textCodeBlock-background); }
code { font-family: var(--vscode-editor-font-family); white-space: pre; }
</style>
</head>
<body>
<h1>DevLens Review</h1>
${body}
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('[data-not-applicable]');
  if (button) vscode.postMessage({ action: 'notApplicable', id: button.dataset.notApplicable });
});
</script>
</body>
</html>`;
}

function renderProviderReview(state: Extract<PanelState, { kind: 'ready' }>): string {
	const dismissedCount = state.dismissedObservationIds?.length ?? 0;
	const visible = allMentorObservations(state.mentorReview)
		.filter(item => !(state.dismissedObservationIds ?? []).includes(item.id));
	const items = visible.map(item => renderMentorObservation(item, state.context.startLine)).join('\n');
	const status = state.providerMessage
		? `<p class="status ${state.providerStatus === 'failed' ? 'error' : ''}" role="${state.providerStatus === 'failed' ? 'alert' : 'status'}">${escapeHtml(state.providerMessage)}</p>`
		: '';
	if (!state.mentorReview) return status;
	const takeaway = state.mentorReview.takeaway
		? `<p><strong>Takeaway:</strong> ${escapeHtml(state.mentorReview.takeaway)}</p>`
		: '';
	return `<section class="provider" aria-labelledby="provider-heading"><h2 id="provider-heading">OpenAI mentor review</h2>
<p class="badge">OpenAI-assisted · Evidence checked against this source · Not a substitute for tests or security review</p>
${status}${dismissedCount > 0 ? `<p class="meta" role="status">${dismissedCount} item${dismissedCount === 1 ? '' : 's'} marked not applicable for this review only; nothing was saved.</p>` : ''}${items}${takeaway}</section>`;
}

function renderMentorObservation(item: MentorObservation, lineOffset: number): string {
	return `<article class="finding" aria-labelledby="${escapeHtml(item.id)}">
<h2 id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</h2>
<p class="badge">${escapeHtml(item.category)} · ${escapeHtml(item.kind)} · ${escapeHtml(item.confidence)} confidence · OpenAI-assisted</p>
<p><strong>What:</strong> ${escapeHtml(item.what)}</p>
<p><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</p>
<p><strong>${item.kind === 'strength' ? 'Build on this:' : 'One way to improve:'}</strong> ${escapeHtml(item.action)}</p>
<details><summary>Why this?</summary><p>${escapeHtml(item.whyThis)}</p></details>
<p class="meta">Evidence · line ${item.evidence.startLine + lineOffset + 1}${item.evidence.endLine > item.evidence.startLine ? `–${item.evidence.endLine + lineOffset + 1}` : ''}</p>
<pre><code>${escapeHtml(item.evidence.text)}</code></pre>
<button type="button" data-not-applicable="${escapeHtml(item.id)}">Not applicable</button>
</article>`;
}

function allMentorObservations(review: MentorReview | undefined): MentorObservation[] {
	return review ? [...review.strengths, ...review.suggestions] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function analysisSummary(analysis: AnalysisResult, languageId: string): string {
	if (analysis.findings.length > 0) {
		return `Found ${analysis.findings.length} evidence-linked local ${analysis.findings.length === 1 ? 'observation' : 'observations'}. These checks are intentionally narrow; they are not a complete correctness or security assessment.`;
	}
	if (analysis.adapter === 'generic') {
		return `No verified local checks are available for ${languageId || 'this language'} yet. DevLens captured the code, but makes no claims about it.`;
	}
	return 'No findings matched DevLens’ current high-confidence checks. This does not mean the code is issue-free; the local checks are intentionally limited.';
}

function renderFindings(findings: AnalysisResult['findings'], lineOffset: number): string {
	if (findings.length === 0) return '';
	return findings.map(finding => `<article class="finding" aria-labelledby="finding-${escapeHtml(finding.id)}">
<h2 id="finding-${escapeHtml(finding.id)}">${escapeHtml(finding.title)}</h2>
<p class="badge">${escapeHtml(finding.category)} · ${escapeHtml(finding.kind)} · High confidence · Local check</p>
<p><strong>What:</strong> ${escapeHtml(finding.what)}</p>
<p><strong>Why it matters:</strong> ${escapeHtml(finding.why)}</p>
<p><strong>${finding.kind === 'strength' ? 'Build on this:' : 'One way to improve:'}</strong> ${escapeHtml(finding.improve)}</p>
<p class="meta">Evidence · line ${finding.evidence.startLine + lineOffset + 1}${finding.evidence.endLine > finding.evidence.startLine ? `–${finding.evidence.endLine + lineOffset + 1}` : ''}</p>
<pre><code>${escapeHtml(finding.evidence.text)}</code></pre>
</article>`).join('\n');
}

function renderCoachingProfile(profile: CoachingProfile, enabled: boolean): string {
	if (!enabled) return '<p>Personal coaching context is temporarily disabled.</p>';
	const details = [
		profile.experienceLevel !== 'unspecified' ? `Experience: ${formatExperience(profile.experienceLevel)}` : '',
		profile.currentRole ? `Current role: ${profile.currentRole}` : '',
		profile.targetRole ? `Target role: ${profile.targetRole}` : '',
		profile.improvementGoal ? `Goal: ${profile.improvementGoal}` : ''
	].filter(Boolean);
	const lens = profile.reviewLens === 'stretch' ? 'Stretch me' : 'Current level';
	if (details.length === 0) return `<p>No profile set · ${lens} lens. Use DevLens: Configure Coaching Profile to personalize later reviews.</p>`;
	return `<p>${escapeHtml(details.join(' · '))}</p><p>Lens: ${lens}</p><p class="meta">This is your coaching preference, not a rating of your ability.</p>`;
}

function scopeLabel(scope: ReviewContext['scope']): string {
	if (scope === 'function') return 'Function';
	if (scope === 'file') return 'Current file';
	return 'Selected code';
}

function formatExperience(level: CoachingProfile['experienceLevel']): string {
	if (level === 'midLevel') return 'Mid-level';
	if (level === 'senior') return 'Senior';
	return 'Beginner';
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
