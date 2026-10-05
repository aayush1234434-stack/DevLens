import { AnalysisResult } from './analyzer';
import { MentorReview, MentorReviewInput, validateMentorReview } from './mentorReview';
import { MentorProvider } from './openAiProvider';
import { maximumReviewCharacters } from './reviewContext';

export interface MentorReviewRequest {
	enabled: boolean;
	consentGranted: boolean;
	apiKey: string;
	input: MentorReviewInput;
	localAnalysis: AnalysisResult;
	provider: MentorProvider;
	signal?: AbortSignal;
}

/** The only bridge from the UI's explicit consent to a provider request. */
export async function requestMentorReview(request: MentorReviewRequest): Promise<MentorReview | undefined> {
	if (!request.enabled || !request.consentGranted) return undefined;
	if (!request.apiKey.trim()) throw new Error('Configure an OpenAI API key before requesting a remote review.');
	if (request.input.code.length === 0 || request.input.code.length > maximumReviewCharacters) {
		throw new Error('The review code is empty or exceeds DevLens’ local size limit.');
	}
	const raw = await request.provider.review(request.input, request.apiKey, request.signal);
	return validateMentorReview(raw, request.input.code, request.localAnalysis);
}
