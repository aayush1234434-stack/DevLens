import { mentorReviewJsonSchema, MentorReviewInput, buildMentorPrompt } from './mentorReview';

export const defaultOpenAIModel = 'gpt-6-astra';

export function normalizeOpenAIModel(value: unknown): string {
	return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
		? value
		: defaultOpenAIModel;
}

export interface MentorProvider {
	review(input: MentorReviewInput, apiKey: string, signal?: AbortSignal): Promise<unknown>;
}

export class OpenAIResponsesProvider implements MentorProvider {
	constructor(
		private readonly fetcher: typeof fetch = fetch,
		private readonly model = defaultOpenAIModel,
		private readonly timeoutMilliseconds = 45_000
	) {}

	async review(input: MentorReviewInput, apiKey: string, signal?: AbortSignal): Promise<unknown> {
		if (signal?.aborted) throw new Error('OpenAI review was cancelled.');
		const prompt = buildMentorPrompt(input);
		let response: Response;
		const requestController = new AbortController();
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			requestController.abort();
		}, this.timeoutMilliseconds);
		const abortFromCaller = () => requestController.abort();
		signal?.addEventListener('abort', abortFromCaller, { once: true });
		const cleanup = () => {
			clearTimeout(timeout);
			signal?.removeEventListener('abort', abortFromCaller);
		};
		try {
			response = await this.fetcher('https://api.openai.com/v1/responses', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: this.model,
					instructions: prompt.instructions,
					input: prompt.input,
					store: false,
					max_output_tokens: 2500,
					text: {
						format: {
							type: 'json_schema',
							name: 'devlens_mentor_review',
							strict: true,
							schema: mentorReviewJsonSchema
						}
					}
				}),
				signal: requestController.signal
			});
		} catch {
			cleanup();
			if (signal?.aborted) throw new Error('OpenAI review was cancelled.');
			if (timedOut) throw new Error('OpenAI did not respond before the review timed out. Your local findings are still available.');
			throw new Error('Could not reach OpenAI. Check your network connection and try again.');
		}

		if (!response.ok) {
			cleanup();
			if (response.status === 401 || response.status === 403) throw new Error('OpenAI rejected the API key or account permission. Check your key and API access.');
			if (response.status === 429) throw new Error('OpenAI rate or usage limit reached. Check your API account and try again later.');
			throw new Error(`OpenAI review failed (HTTP ${response.status}). Your local findings are still available.`);
		}

		let bodyText: string;
		try {
			bodyText = await response.text();
		} catch {
			cleanup();
			if (signal?.aborted) throw new Error('OpenAI review was cancelled.');
			if (timedOut) throw new Error('OpenAI did not respond before the review timed out. Your local findings are still available.');
			throw new Error('OpenAI returned an unreadable response. Your local findings are still available.');
		} finally {
			cleanup();
		}
		if (bodyText.length > 100_000) throw new Error('OpenAI returned an oversized response. Your local findings are still available.');
		let body: unknown;
		try {
			body = JSON.parse(bodyText) as unknown;
		} catch {
			throw new Error('OpenAI returned an unreadable response. Your local findings are still available.');
		}
		const text = extractOutputText(body);
		if (!text || text.length > 30_000) throw new Error('OpenAI returned an empty or oversized review. Your local findings are still available.');
		try {
			return JSON.parse(text) as unknown;
		} catch {
			throw new Error('OpenAI returned a malformed review. Your local findings are still available.');
		}
	}
}

function extractOutputText(body: unknown): string | undefined {
	if (!isRecord(body) || !Array.isArray(body.output)) return undefined;
	const texts: string[] = [];
	for (const item of body.output) {
		if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
		for (const content of item.content) {
			if (isRecord(content) && content.type === 'output_text' && typeof content.text === 'string') texts.push(content.text);
		}
	}
	return texts.length === 1 ? texts[0] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
