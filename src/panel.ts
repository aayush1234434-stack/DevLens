import * as vscode from 'vscode';
import { AnalysisResult } from './analyzer';
import { CoachingProfile } from './coachingProfile';
import { ReviewContext } from './reviewContext';

export type PanelState =
	| { kind: 'loading'; message: string }
	| { kind: 'error'; message: string }
	| { kind: 'ready'; context: ReviewContext; analysis: AnalysisResult; coachingProfile: CoachingProfile; profileEnabled: boolean };

export function showReviewPanel(state: PanelState): vscode.WebviewPanel {
	const panel = vscode.window.createWebviewPanel(
		'devlens.review',
		'DevLens Review',
		vscode.ViewColumn.Beside,
		{ enableScripts: false, retainContextWhenHidden: false }
	);
	panel.webview.html = renderPanel(state);
	return panel;
}

export function renderPanel(state: PanelState): string {
	const body = state.kind === 'loading'
		? `<p class="status" role="status">${escapeHtml(state.message)}</p>`
		: state.kind === 'error'
			? `<p class="status error" role="alert">${escapeHtml(state.message)}</p>`
			: `<p class="status" role="status">${analysisSummary(state.analysis, state.context.languageId)}</p>
${renderFindings(state.analysis.findings, state.context.startLine)}
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
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
pre { overflow: auto; padding: 1rem; background: var(--vscode-textCodeBlock-background); }
code { font-family: var(--vscode-editor-font-family); white-space: pre; }
</style>
</head>
<body>
<h1>DevLens Review</h1>
${body}
</body>
</html>`;
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
