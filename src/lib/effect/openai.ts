import { JSONSchema, Schema } from '@effect/schema';
import { OpenAI } from 'openai';
import { APIError } from 'openai/error';
import {
	Config,
	Context,
	Data,
	Effect,
	Layer,
	Predicate,
	Secret,
	Option,
	ConfigProvider,
} from 'effect';

export class OpenAIError extends Data.TaggedError('OpenAIError')<{
	readonly error: APIError;
}> {
	get message() {
		return String(
			Predicate.hasProperty(this.error, 'message') ? this.error.message : this.error,
		);
	}
}

export interface Message {
	readonly bot: boolean;
	readonly name?: string;
	readonly content: string;
}

export interface ChoiceToolCall<A>
	extends Schema.Struct<{
		message: Schema.Struct<{
			tool_calls: Schema.NonEmptyArray<
				Schema.Struct<{
					function: Schema.Struct<{
						name: Schema.Literal<[string]>;
						arguments: Schema.Schema<A, string>;
					}>;
				}>
			>;
		}>;
	}> {}

const ChoiceToolCall = <A, I>(
	name: string,
	schema: Schema.Schema<A, I>,
): ChoiceToolCall<A> =>
	Schema.Struct({
		message: Schema.Struct({
			tool_calls: Schema.NonEmptyArray(
				Schema.Struct({
					function: Schema.Struct({
						name: Schema.Literal(name),
						arguments: Schema.parseJson(schema),
					}),
				}),
			),
		}),
	});

export class OpenAIFn<A> {
	constructor(
		readonly name: string,
		readonly description: string,
		readonly schema: Schema.Schema<A, any>,
	) {
		this.jsonSchema = JSONSchema.make(schema) as any;
		this.choiceSchema = ChoiceToolCall(name, schema);
	}

	readonly jsonSchema: Record<string, unknown>;
	readonly choiceSchema: ChoiceToolCall<A>;

	decodeChoice(value: OpenAI.ChatCompletion.Choice | undefined) {
		return Schema.decodeUnknown(this.choiceSchema)(value);
	}

	get tool(): OpenAI.ChatCompletionTool {
		return {
			type: 'function',
			function: {
				name: this.name,
				description: this.description,
				parameters: this.jsonSchema,
			},
		};
	}
}

const make = Effect.gen(function* () {
	const apiKey = yield* Config.secret('apiKey');
	const organization = yield* Config.option(Config.secret('organization'));

	const client = new OpenAI({
		apiKey: Secret.value(apiKey),
		organization: Option.getOrUndefined(Option.map(organization, Secret.value)),
	});

	const call = <A>(f: (api: OpenAI, signal: AbortSignal) => Promise<A>) =>
		Effect.tryPromise({
			try: (signal) => f(client, signal),
			catch: (error) => new OpenAIError({ error: error as APIError }),
		});

	const fn = <A>(tool: OpenAIFn<A>, prompt: string) =>
		call((_, signal) =>
			_.chat.completions.create(
				{
					model: 'gpt-4-turbo-preview',
					tools: [tool.tool],
					tool_choice: {
						type: 'function',
						function: {
							name: tool.name,
						},
					},
					messages: [
						{
							role: 'user',
							content: prompt,
						},
					],
				},
				{ signal },
			),
		).pipe(
			Effect.andThen((_) => tool.decodeChoice(_.choices[0])),
			Effect.map((_) => _.message.tool_calls[0].function.arguments),
		);

	return {
		client,
		call,
		fn,
	} as const;
}).pipe(
	Effect.withConfigProvider(
		ConfigProvider.fromEnv().pipe(
			ConfigProvider.nested('openai'),
			ConfigProvider.constantCase,
		),
	),
);

export class OpenAIYo extends Context.Tag('app/OpenAI')<
	OpenAI,
	Effect.Effect.Success<typeof make>
>() {
	static Live = Layer.effect(OpenAIYo, make);
}
