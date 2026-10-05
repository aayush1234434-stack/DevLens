import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultOpenAIModel, normalizeOpenAIModel, OpenAIResponsesProvider } from '../src/openAiProvider';

test('bounds the configurable OpenAI model setting', () => {
	assert.equal(normalizeOpenAIModel('gpt-4.1-mini'), 'gpt-4.1-mini');
	assert.equal(normalizeOpenAIModel('model\nignore consent'), defaultOpenAIModel);
	assert.equal(normalizeOpenAIModel('x'.repeat(65)), defaultOpenAIModel);
});

const providerOutput = JSON.stringify({ formatVersion: 1, strengths: [], suggestions: [], takeaway: 'No specific issue found.' });

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('sends Responses API structured output request without storing it', async () => {
	let requestedUrl = '';
	let requestedInit: RequestInit | undefined;
	const mockFetch: typeof fetch = async (input, init) => {
		requestedUrl = String(input);
		requestedInit = init;
		return response({ output: [{ type: 'message', content: [{ type: 'output_text', text: providerOutput }] }] });
	};
	const provider = new OpenAIResponsesProvider(mockFetch, 'test-model');
	const result = await provider.review({
		languageId: 'python', code: 'print("hello")', explanationLevel: 'beginner', explanationStyle: 'concise'
	}, 'secret-test-key');

	assert.equal(requestedUrl, 'https://api.openai.com/v1/responses');
	assert.equal(requestedInit?.method, 'POST');
	assert.equal(new Headers(requestedInit?.headers).get('Authorization'), 'Bearer secret-test-key');
	const payload = JSON.parse(String(requestedInit?.body)) as Record<string, any>;
	assert.equal(payload.model, 'test-model');
	assert.equal(payload.store, false);
	assert.equal(payload.text.format.type, 'json_schema');
	assert.equal(payload.text.format.strict, true);
	assert.match(JSON.parse(payload.input).sourceCode, /print\("hello"\)/);
	assert.doesNotMatch(String(requestedInit?.body), /secret-test-key/);
	assert.deepEqual(result, JSON.parse(providerOutput));
});

test('maps provider errors without exposing provider response bodies', async () => {
	const forbidden: typeof fetch = async () => response({ error: 'sensitive internal details' }, 401);
	await assert.rejects(new OpenAIResponsesProvider(forbidden).review({
		languageId: 'javascript', code: 'const x = 1;', explanationLevel: 'intermediate', explanationStyle: 'concise'
	}, 'bad-key'), error => {
		assert.match(String(error), /rejected the API key/i);
		assert.doesNotMatch(String(error), /sensitive internal details/);
		return true;
	});

	const limited: typeof fetch = async () => response({}, 429);
	await assert.rejects(new OpenAIResponsesProvider(limited).review({
		languageId: 'javascript', code: 'const x = 1;', explanationLevel: 'intermediate', explanationStyle: 'concise'
	}, 'key'), /usage limit/i);
});

test('handles malformed, missing, and oversized response content', async () => {
	const badJson: typeof fetch = async () => response({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{bad' }] }] });
	await assert.rejects(new OpenAIResponsesProvider(badJson).review({
		languageId: 'javascript', code: 'const x = 1;', explanationLevel: 'intermediate', explanationStyle: 'concise'
	}, 'key'), /malformed review/i);

	const missing: typeof fetch = async () => response({ output: [] });
	await assert.rejects(new OpenAIResponsesProvider(missing).review({
		languageId: 'javascript', code: 'const x = 1;', explanationLevel: 'intermediate', explanationStyle: 'concise'
	}, 'key'), /empty or oversized review/i);

	const oversized: typeof fetch = async () => response({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'x'.repeat(30_001) }] }] });
	await assert.rejects(new OpenAIResponsesProvider(oversized).review({
		languageId: 'javascript', code: 'const x = 1;', explanationLevel: 'intermediate', explanationStyle: 'concise'
	}, 'key'), /empty or oversized review/i);
});

test('turns network errors and cancellation into safe messages', async () => {
	const offline: typeof fetch = async () => { throw new Error('private network diagnostic'); };
	await assert.rejects(new OpenAIResponsesProvider(offline).review({
		languageId: 'javascript', code: 'const x = 1;', explanationLevel: 'intermediate', explanationStyle: 'concise'
	}, 'key'), error => {
		assert.match(String(error), /network connection/i);
		assert.doesNotMatch(String(error), /private network diagnostic/);
		return true;
	});

	const cancelled = new AbortController();
	cancelled.abort();
	const aborting: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
		if (init?.signal?.aborted) reject(new Error('aborted'));
	});
	await assert.rejects(new OpenAIResponsesProvider(aborting).review({
		languageId: 'javascript', code: 'const x = 1;', explanationLevel: 'intermediate', explanationStyle: 'concise'
	}, 'key', cancelled.signal), /cancelled/i);
});

test('times out stalled provider requests', async () => {
	const delayed: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
	});
	await assert.rejects(new OpenAIResponsesProvider(delayed, 'test-model', 5).review({
		languageId: 'javascript', code: 'const x = 1;', explanationLevel: 'intermediate', explanationStyle: 'concise'
	}, 'key'), /timed out/i);
});
