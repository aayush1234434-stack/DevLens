import { CoachingProfile } from './coachingProfile';

export interface DisclosedReviewContext {
	code: string;
	languageId: string;
	scope: string;
	truncated: boolean;
}

export function buildOpenAIDisclosure(
	reviewContext: DisclosedReviewContext,
	profile: CoachingProfile | undefined,
	level: string,
	style: string,
	model: string
): string {
	const includedProfile: string[] = [];
	if (profile?.experienceLevel && profile.experienceLevel !== 'unspecified') includedProfile.push(`experience preference: ${profile.experienceLevel}`);
	if (profile?.currentRole) includedProfile.push(`current role: ${profile.currentRole}`);
	if (profile?.targetRole) includedProfile.push(`target role: ${profile.targetRole}`);
	if (profile?.improvementGoal) includedProfile.push(`improvement goal: ${profile.improvementGoal}`);
	if (profile?.reviewLens) includedProfile.push(`review lens: ${profile.reviewLens}`);
	return [
		`Send this ${clean(model, 80)} review to OpenAI? This may use your OpenAI API credits.`,
		`OpenAI receives the review context shown in this DevLens panel (${clean(reviewContext.languageId, 80)}, ${reviewContext.code.length} characters${reviewContext.truncated ? ', shortened to DevLens’ 50,000-character limit' : ''}), explanation depth ${clean(level, 40)}, explanation style ${clean(style, 40)}, and ${includedProfile.length ? 'these coaching preferences: ' + includedProfile.map(value => clean(value, 300)).join('; ') : 'no personal coaching profile fields'}.`,
		'It will not receive the file name, workspace path, other files, or review history. Your API key is stored in VS Code SecretStorage and used only to authenticate the request. OpenAI processes the request under its applicable API data policies; only send code you are allowed to share.'
	].join('\n\n');
}

function clean(value: string, maximum: number): string {
	return value.replace(/\s+/g, ' ').trim().slice(0, maximum);
}
