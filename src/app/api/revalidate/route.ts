import { revalidatePath, revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { parseBody } from 'next-sanity/webhook';

type WebhookPayload = {
	_type: string;
};

const typeToPathMap = new Map([
	['wiki-page', '/wiki/[slug]'],
	['talk', '/talks/[slug]'],
]);

export async function POST(req: NextRequest) {
	try {
		if (!process.env.SANITY_REVALIDATE_SECRET) {
			return Response.json({ message: 'Webhook is not configured' }, { status: 503 });
		}
		const { isValidSignature, body } = await parseBody<WebhookPayload>(
			req,
			process.env.SANITY_REVALIDATE_SECRET,
		);

		if (!isValidSignature) {
			const message = 'Invalid signature';
			return Response.json(
				{ message },
				{
					status: 401,
				},
			);
		}

		if (!body?._type) {
			const message = 'Bad Request';
			return Response.json({ message }, { status: 400 });
		}

		const { _type: type } = body;

		revalidateTag(type, { expire: 0 });
		console.log('Revalidating tag:', type);

		const pathToRevalidate = typeToPathMap.get(type);

		if (pathToRevalidate) {
			revalidatePath(pathToRevalidate, 'page');
			console.log('Revalidating path:', pathToRevalidate);
		}

		console.log('Successfully revalidated type:', type);

		return NextResponse.json({ body });
	} catch (err) {
		console.error(err);
		const message =
			err instanceof Error && 'message' in err ? err.message : (err as string);
		return new Response(message, { status: 500 });
	}
}
