import { z } from "zod";
import { env } from "$env/dynamic/private";
import type { Endpoint } from "../endpoints";
import type { TextGenerationStreamOutput } from "@huggingface/inference";
import type { Cohere, CohereClient } from "cohere-ai";
import { buildPrompt } from "$lib/buildPrompt";
import { ToolResultStatus, type Tool, type ToolResult } from "$lib/types/Tool";
import stream from "stream";

export const endpointCohereParametersSchema = z.object({
	weight: z.number().int().positive().default(1),
	model: z.any(),
	type: z.literal("cohere"),
	apiKey: z.string().default(env.COHERE_API_TOKEN),
	raw: z.boolean().default(false),
});

export async function endpointCohere(
	input: z.input<typeof endpointCohereParametersSchema>
): Promise<Endpoint> {
	const { apiKey, model, raw } = endpointCohereParametersSchema.parse(input);

	let cohere: CohereClient;

	try {
		cohere = new (await import("cohere-ai")).CohereClient({
			token: apiKey,
		});
	} catch (e) {
		throw new Error("Failed to import cohere-ai", { cause: e });
	}

	return async ({ messages, preprompt, generateSettings, continueMessage, tools, toolResults }) => {
		let system = preprompt;
		if (messages?.[0]?.from === "system") {
			system = messages[0].content;
		}

		tools = tools?.filter((tool) => tool.name !== "directly_answer")?.map(toCohereTool);
		console.log(toolResults);

		const parameters = { ...model.parameters, ...generateSettings };

		return (async function* () {
			let stream;
			let tokenId = 0;

			if (raw) {
				const prompt = await buildPrompt({
					messages,
					model,
					preprompt: system,
					continueMessage,
					tools,
					toolResults,
				});

				stream = await cohere.chatStream({
					message: prompt,
					rawPrompting: true,
					model: model.id ?? model.name,
					p: parameters?.top_p,
					k: parameters?.top_k,
					maxTokens: parameters?.max_new_tokens,
					temperature: parameters?.temperature,
					stopSequences: parameters?.stop,
					frequencyPenalty: parameters?.frequency_penalty,
				});
			} else {
				const formattedMessages = messages
					.filter((message) => message.from !== "system")
					.map((message) => ({
						role: message.from === "user" ? "USER" : "CHATBOT",
						message: message.content,
					})) satisfies Cohere.ChatMessage[];

				stream = await cohere
					.chatStream({
						model: model.id ?? model.name,
						chatHistory: formattedMessages.slice(0, -1),
						message: formattedMessages[formattedMessages.length - 1].message,
						preamble: system,
						p: parameters?.top_p,
						k: parameters?.top_k,
						maxTokens: parameters?.max_new_tokens,
						temperature: parameters?.temperature,
						stopSequences: parameters?.stop,
						frequencyPenalty: parameters?.frequency_penalty,
						tools,
						toolResults: toolResults?.map((toolResult) => {
							if (toolResult.status === ToolResultStatus.Error) {
								return { call: toolResult.call, outputs: [{ error: toolResult.message }] };
							}
							return { call: toolResult.call, outputs: toolResult.outputs };
						}),
					})
					.catch((err) => {
						if (err.body) {
							convertWebStreamToBuffer(err.body).then(console.log).catch(console.error);
						} else {
							console.error(err);
						}
						throw err;
					});
			}

			for await (const output of stream) {
				if (output.eventType === "text-generation") {
					yield {
						token: {
							id: tokenId++,
							text: output.text,
							logprob: 0,
							special: false,
						},
						generated_text: null,
						details: null,
					} satisfies TextGenerationStreamOutput;
				} else if (output.eventType === "tool-calls-generation") {
					yield {
						token: {
							id: tokenId++,
							text: "",
							logprob: 0,
							special: true,
							toolCalls: output.toolCalls,
						},
						generated_text: null,
						details: null,
					};
				} else if (output.eventType === "stream-end") {
					if (["ERROR", "ERROR_TOXIC", "ERROR_LIMIT"].includes(output.finishReason)) {
						throw new Error(output.finishReason);
					}
					yield {
						token: {
							id: tokenId++,
							text: "",
							logprob: 0,
							special: true,
						},
						generated_text: output.response.text,
						details: null,
					};
				}
			}
		})();
	};
}

function toCohereTool(tool: Tool): Cohere.Tool {
	return {
		name: tool.name,
		description: tool.description,
		parameterDefinitions: tool.parameter_definitions,
	};
}

async function convertWebStreamToBuffer(webReadableStream) {
	return new Promise((resolve, reject) => {
		const chunks = [];

		stream.pipeline(
			webReadableStream,
			new stream.Writable({
				write(chunk, encoding, callback) {
					chunks.push(chunk);
					callback();
				},
			}),
			(err) => {
				if (err) {
					reject(err);
				} else {
					resolve(Buffer.concat(chunks).toString("utf-8"));
				}
			}
		);
	});
}
