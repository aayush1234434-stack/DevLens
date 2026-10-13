import { MemorySnapshot } from './mentorMemory';
import { comparePractice, PracticeDepth, PracticeItem, practiceLabel, practicePrompt } from './practiceLoop';

/** Pure renderer: all persisted and user-controlled text is escaped before entering HTML. */
export function renderPracticeHtml(items: PracticeItem[], memory: MemorySnapshot, depth: PracticeDepth, nonce: string): string {
	const open = items.filter(item => item.status === 'active' || item.status === 'paused');
	const archived = items.filter(item => item.status === 'completed' || item.status === 'notRelevant');
	const memoryStatus = !memory.settings.enabled ? 'Mentor memory is off. Practice cards still work, but new reviews are not retained for comparison.'
		: memory.settings.paused ? 'Mentor memory is paused. Practice actions still work; new reviews are not retained for comparison.'
			: 'Later opted-in reviews can add comparison examples. No source code is stored in practice cards.';
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>DevLens Practice Queue</title>
<style>
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 0 1rem 2rem; line-height: 1.45; }
h1 { font-size: 1.3rem; } h2 { font-size: 1.1rem; } h3 { font-size: 1rem; }
.item { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: .8rem; margin: 1rem 0; }
.meta { color: var(--vscode-descriptionForeground); font-size: .9rem; }
button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: .4rem .7rem; cursor: pointer; margin: .25rem .4rem .25rem 0; }
button:hover { background: var(--vscode-button-hoverBackground); }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
.controls { border-top: 1px solid var(--vscode-panel-border); padding-top: .8rem; margin-top: 1rem; }
</style></head><body>
<h1 id="practice-heading" tabindex="-1">DevLens Practice Queue</h1>
<p role="status">${open.length} of 3 active or paused concepts. ${escapeHtml(memoryStatus)}</p>
<p class="meta">Add a card with “Practice this” on an evidence-linked suggestion. Cards save only a concept tag, category, language, dates, and optional review ID. Exercises use concepts, not your source code. Completing a card is your choice, not a mastery claim.</p>
<h2>Current practice</h2>
${open.length ? open.map(item => renderItem(item, memory, depth)).join('\n') : '<p>No open practice cards. Choose a suggestion that matters to your goal when you are ready.</p>'}
<h2>Completed or dismissed</h2>
${archived.length ? `<details><summary>${archived.length} saved card${archived.length === 1 ? '' : 's'}</summary>${archived.map(item => renderItem(item, memory, depth)).join('\n')}</details>` : '<p class="meta">No completed or dismissed cards retained.</p>'}
<div class="controls" aria-label="Practice queue controls">
${button('reviewSelection', 'Review selected code again')}
${button('skillProfile', 'Open skill profile')}${button('manageMemory', 'Manage mentor memory')}
${items.length ? button('clear', 'Delete all practice cards') : ''}
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const previous = vscode.getState();
if (previous) requestAnimationFrame(() => {
  window.scrollTo(0, Number.isFinite(previous.scrollY) ? previous.scrollY : 0);
  const target = previous.itemId ? [...document.querySelectorAll('button[data-id]')].find(button => button.dataset.id === previous.itemId) : null;
  (target || document.getElementById('practice-heading')).focus();
});
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  vscode.setState({ scrollY: window.scrollY, itemId: button.dataset.id });
  vscode.postMessage({ action: button.dataset.action, id: button.dataset.id });
});
</script></body></html>`;
}

function renderItem(item: PracticeItem, memory: MemorySnapshot, depth: PracticeDepth): string {
	const prompt = practicePrompt(item, depth);
	const comparison = comparePractice(item, memory);
	const earlierGoal = item.goalEpoch !== memory.settings.goalEpoch;
	const explanation = comparison.status === 'no-later-reviews' ? 'No later retained review in this language yet.'
		: comparison.status === 'limited' ? 'There are too few later reviews with usable tags to compare this concept.'
			: comparison.status === 'seen-once' ? 'This tagged suggestion appeared in one later retained review; one example is not a recurring pattern.'
				: comparison.status === 'repeated' ? 'This same tagged suggestion appeared in at least two later retained reviews.'
					: comparison.status === 'mixed' ? 'Later reviews contain both this suggestion tag and a strength in the same area. These may describe different code; neither cancels the other.'
						: 'This tag was not observed in later retained reviews with other tags. That is not proof the issue was fixed or the concept mastered.';
	const actions = item.status === 'active'
		? `${button('practiced', 'Mark practiced', item.id)}${button('pause', 'Pause', item.id)}${button('complete', 'Complete', item.id)}${button('notRelevant', 'Not relevant', item.id)}`
		: item.status === 'paused'
			? `${button('resume', 'Resume', item.id)}${button('complete', 'Complete', item.id)}${button('notRelevant', 'Not relevant', item.id)}`
			: '';
	return `<section class="item" aria-labelledby="item-${escapeHtml(item.id)}">
<h3 id="item-${escapeHtml(item.id)}">${escapeHtml(practiceLabel(item))}</h3>
<p class="meta">${escapeHtml(item.status === 'notRelevant' ? 'Not relevant' : item.status)} · ${escapeHtml(item.languageId)} · added ${escapeHtml(item.createdAt.slice(0, 10))}${earlierGoal ? ' · previous goal context' : ''}</p>
${item.lastPracticedAt ? `<p class="meta">You marked this practiced on ${escapeHtml(item.lastPracticedAt.slice(0, 10))}. This does not assess proficiency.</p>` : ''}
<p><strong>Small exercise:</strong> ${escapeHtml(prompt.exercise)}</p>
<p><strong>Self-check:</strong> ${escapeHtml(prompt.selfCheck)}</p>
<p><strong>Review again:</strong> ${escapeHtml(explanation)}</p>
<p class="meta">${comparison.matchingReviewCount} matching suggestion review${comparison.matchingReviewCount === 1 ? '' : 's'}; ${comparison.strengthReviewCount} same-area strength review${comparison.strengthReviewCount === 1 ? '' : 's'}; ${comparison.taggedReviewCount} of ${comparison.laterReviewCount} later retained review${comparison.laterReviewCount === 1 ? '' : 's'} in this language had usable tags. Only exact suggestion tags are matched. Provider tags are broad themes, not proof of the same code issue. Retention and review scope limit this comparison. A missing or changed tag is not proof an issue was fixed or a concept mastered.</p>
${item.sourceRecordId ? `<p class="meta">Original review ${comparison.sourceRetained ? 'is retained' : 'is no longer retained'}.</p>` : '<p class="meta">Original review was not retained in mentor memory.</p>'}
${item.sourceRecordId && comparison.sourceRetained ? button('inspect', 'Inspect original review metadata', item.id) : ''}
${comparison.examples.length ? `<details><summary>Later tagged examples</summary><ul>${comparison.examples.map(example => `<li>${escapeHtml(example.date)} · ${escapeHtml(example.languageId)} · ${escapeHtml(example.kind)} ${button('inspectLater', 'Inspect saved review', example.recordId)}</li>`).join('')}</ul></details>` : ''}
<div aria-label="Actions for ${escapeHtml(practiceLabel(item))}">${actions}${button('delete', 'Delete card', item.id)}</div>
</section>`;
}

function button(action: string, label: string, id?: string): string {
	return `<button type="button" data-action="${escapeHtml(action)}"${id ? ` data-id="${escapeHtml(id)}"` : ''}>${escapeHtml(label)}</button>`;
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
