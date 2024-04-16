import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { parseBody } from 'next-sanity/webhook';

type WebhookPayload = {
	_type: string;
};

export async function POST(req: NextRequest) {
	try {
		const { isValidSignature, body } = await parseBody<WebhookPayload>(
			req,
			process.env.SANITY_REVALIDATE_SECRET,
		);

		if (!isValidSignature) {
			const message = 'Invalid signature';
			return new Response(JSON.stringify({ message, isValidSignature, body }), {
				status: 401,
			});
		}

		if (!body?._type) {
			const message = 'Bad Request';
			return new Response(JSON.stringify({ message, body }), { status: 400 });
		}

		revalidateTag(body._type);

		console.log('Successfully revalidated');

		return NextResponse.json({ body });
	} catch (err) {
		console.error(err);
		const message =
			err instanceof Error && 'message' in err ? err.message : (err as string);
		return new Response(message, { status: 500 });
	}
}
