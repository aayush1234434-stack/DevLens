import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	defaultCoachingProfile,
	hasCoachingProfile,
	normalizeCoachingProfile
} from '../src/coachingProfile';

test('an empty profile is skippable and uses the current-level default lens', () => {
	const profile = normalizeCoachingProfile(undefined);
	assert.deepEqual(profile, defaultCoachingProfile);
	assert.equal(hasCoachingProfile(profile), false);
});

test('normalizes editable profile values and both review lenses', () => {
	const profile = normalizeCoachingProfile({
		experienceLevel: 'midLevel',
		currentRole: '  Frontend developer  ',
		targetRole: 'Backend engineer',
		improvementGoal: 'Testing',
		reviewLens: 'stretch'
	});
	assert.equal(profile.experienceLevel, 'midLevel');
	assert.equal(profile.currentRole, 'Frontend developer');
	assert.equal(profile.targetRole, 'Backend engineer');
	assert.equal(profile.improvementGoal, 'Testing');
	assert.equal(profile.reviewLens, 'stretch');
	assert.equal(hasCoachingProfile(profile), true);
});

test('rejects invalid stored values and bounds user-authored text', () => {
	const profile = normalizeCoachingProfile({
		experienceLevel: 'expert',
		currentRole: 'x'.repeat(200),
		targetRole: 42,
		improvementGoal: ` ${'y'.repeat(300)} `,
		reviewLens: 'auto'
	});
	assert.equal(profile.experienceLevel, 'unspecified');
	assert.equal(profile.currentRole.length, 120);
	assert.equal(profile.targetRole, '');
	assert.equal(profile.improvementGoal.length, 240);
	assert.equal(profile.reviewLens, 'currentLevel');
});

test('profile can be edited and reset to a skippable state', () => {
	const saved = normalizeCoachingProfile({
		experienceLevel: 'beginner',
		currentRole: 'Student',
		targetRole: 'Frontend developer',
		improvementGoal: 'Accessibility',
		reviewLens: 'currentLevel'
	});
	const edited = normalizeCoachingProfile({ ...saved, improvementGoal: 'Testing', reviewLens: 'stretch' });
	assert.equal(edited.improvementGoal, 'Testing');
	assert.equal(edited.reviewLens, 'stretch');

	const cleared = normalizeCoachingProfile(defaultCoachingProfile);
	assert.equal(hasCoachingProfile(cleared), false);
});
