export type ExperienceLevel = 'unspecified' | 'beginner' | 'midLevel' | 'senior';
export type ReviewLens = 'currentLevel' | 'stretch';

export interface CoachingProfile {
	experienceLevel: ExperienceLevel;
	currentRole: string;
	targetRole: string;
	improvementGoal: string;
	reviewLens: ReviewLens;
}

export const defaultCoachingProfile: CoachingProfile = {
	experienceLevel: 'unspecified',
	currentRole: '',
	targetRole: '',
	improvementGoal: '',
	reviewLens: 'currentLevel'
};

const experienceLevels = new Set<ExperienceLevel>(['unspecified', 'beginner', 'midLevel', 'senior']);
const reviewLenses = new Set<ReviewLens>(['currentLevel', 'stretch']);

export function normalizeCoachingProfile(value: unknown): CoachingProfile {
	if (!value || typeof value !== 'object') return { ...defaultCoachingProfile };
	const profile = value as Partial<CoachingProfile>;
	return {
		experienceLevel: experienceLevels.has(profile.experienceLevel as ExperienceLevel)
			? profile.experienceLevel as ExperienceLevel
			: 'unspecified',
		currentRole: normalizeText(profile.currentRole, 120),
		targetRole: normalizeText(profile.targetRole, 120),
		improvementGoal: normalizeText(profile.improvementGoal, 240),
		reviewLens: reviewLenses.has(profile.reviewLens as ReviewLens)
			? profile.reviewLens as ReviewLens
			: 'currentLevel'
	};
}

export function hasCoachingProfile(profile: CoachingProfile): boolean {
	return profile.experienceLevel !== 'unspecified'
		|| profile.currentRole.length > 0
		|| profile.targetRole.length > 0
		|| profile.improvementGoal.length > 0;
}

function normalizeText(value: unknown, maximumLength: number): string {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximumLength) : '';
}
