import { SkillArea, SkillProfile, SkillTopic, areaLabels } from './skillProfile';

/** Pure renderer so the profile wording and escaping can be tested without an Extension Host. */
export function renderSkillProfileHtml(profile: SkillProfile, goal: string, nonce: string): string {
	const memoryStatus = !profile.memoryEnabled ? 'Mentor memory is off; only previously retained examples can appear.'
		: profile.memoryPaused ? 'Mentor memory is paused; this view will not gain new examples.'
			: 'Mentor memory is on; this view updates from reviews you chose to retain.';
	const body = profile.status === 'hidden'
		? `<p role="status">The skill profile is hidden. Your review records have not been deleted.</p>
${button('show', 'Show skill profile')}`
		: profile.status === 'insufficient'
			? `<p role="status">No area summary yet. ${profile.evidenceReviewCount} of ${profile.minimumReviewCount} retained reviews for this goal have usable tagged observations.</p>
<p>DevLens waits for more examples before describing a pattern. An empty review is not evidence of mastery, and languages without local checks may have no tags unless a provider review was approved.</p>
${renderControls(profile)}`
			: `<p role="status">Based on ${profile.evidenceReviewCount} retained reviews with usable observations out of ${profile.retainedReviewCount} retained reviews for the current goal.</p>
<p>These are patterns in the code you chose to review. They are not a rating of your ability or readiness for a role. Source text was not retained.</p>
${goal ? `<p><strong>Your goal:</strong> ${escapeHtml(goal)}</p>` : ''}
${profile.goalAreas.length ? `<p>Possible goal-related areas from keywords in your goal: ${profile.goalAreas.map(area => escapeHtml(areaLabels[area])).join(', ')}. This match is a navigation hint, not an assessment.</p>` : ''}
${profile.focusAreas.length ? `<p>Areas you chose to focus on: ${profile.focusAreas.map(area => escapeHtml(areaLabels[area])).join(', ')}.</p>` : ''}
${profile.areas.map(renderArea).join('\n')}
${renderControls(profile)}`;
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DevLens Skill Profile</title>
<style>
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 0 1rem 2rem; line-height: 1.45; }
h1 { font-size: 1.3rem; }
h2 { font-size: 1.1rem; margin-bottom: .4rem; }
h3 { font-size: 1rem; }
.area { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: .8rem; margin: 1rem 0; }
.meta { color: var(--vscode-descriptionForeground); font-size: .9rem; }
.controls { border-top: 1px solid var(--vscode-panel-border); padding-top: .8rem; margin-top: 1rem; }
button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: .4rem .7rem; cursor: pointer; margin: .25rem .4rem .25rem 0; }
button:hover { background: var(--vscode-button-hoverBackground); }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
li { margin: .35rem 0; }
summary { cursor: pointer; }
</style>
</head>
<body>
<h1>DevLens Skill Profile</h1>
<p class="meta">${escapeHtml(memoryStatus)}</p>
${body}
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const previous = vscode.getState();
if (previous && Number.isFinite(previous.scrollY)) {
  requestAnimationFrame(() => window.scrollTo(0, previous.scrollY));
}
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  vscode.setState({ scrollY: window.scrollY });
  vscode.postMessage({ action: button.dataset.action, recordId: button.dataset.recordId });
});
</script>
</body>
</html>`;
}

function renderArea(area: SkillArea): string {
	const trend = area.trend
		? `<p><strong>Across retained samples:</strong> Earlier ${area.trend.earlierSamples} reviews: opportunities appeared in ${area.trend.earlierOpportunityReviews}, strengths in ${area.trend.earlierStrengthReviews}. Recent ${area.trend.recentSamples} reviews: opportunities appeared in ${area.trend.recentOpportunityReviews}, strengths in ${area.trend.recentStrengthReviews}. This only compares observed tags in selected reviews; an absent tag does not prove improvement.</p>`
		: '<p class="meta">A time comparison needs at least four reviews with observations and two examples in this area.</p>';
	return `<section class="area" aria-labelledby="area-${escapeHtml(area.category)}">
<h2 id="area-${escapeHtml(area.category)}">${escapeHtml(area.label)}</h2>
<p class="meta">Tagged in ${area.reviewCount} retained review${area.reviewCount === 1 ? '' : 's'}.</p>
<p class="meta">A topic seen once is an observation in one selected sample, not a recurring pattern.</p>
<h3>Strengths observed</h3>
${renderTopics(area.strengths, 'No tagged strength in these samples; this does not mean the code lacks strengths.')}
<h3>Opportunities practiced</h3>
${renderTopics(area.opportunities, 'No tagged opportunity in these samples; this does not mean the area needs no work.')}
${trend}
</section>`;
}

function renderTopics(topics: SkillTopic[], emptyText: string): string {
	if (topics.length === 0) return `<p class="meta">${escapeHtml(emptyText)}</p>`;
	return `<ul>${topics.map(topic => `<li><details>
<summary>${escapeHtml(topic.label)} · ${topic.reviewCount} review${topic.reviewCount === 1 ? '' : 's'}</summary>
<ul>${topic.examples.map(example => `<li>${escapeHtml(example.date)} · ${escapeHtml(example.languageId)} · ${escapeHtml(example.label)}
${button('inspect', 'Inspect saved review', example.recordId)}</li>`).join('')}</ul>
</details></li>`).join('')}</ul>`;
}

function renderControls(profile: SkillProfile): string {
	return `<div class="controls" aria-label="Skill profile controls">
${button('hide', 'Hide profile')}
${button('reset', 'Start a new profile baseline')}
${profile.startAfter ? button('restore', 'Include earlier retained reviews') : ''}
${button('clear', 'Delete current-goal review records')}
${button('manageMemory', 'Manage mentor memory')}
</div>`;
}

function button(action: string, label: string, recordId?: string): string {
	return `<button type="button" data-action="${escapeHtml(action)}"${recordId ? ` data-record-id="${escapeHtml(recordId)}"` : ''}>${escapeHtml(label)}</button>`;
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
