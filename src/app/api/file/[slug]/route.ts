import { getWikiPageContent } from '@/lib/get-wiki-content';
import { NextResponse } from 'next/server';

export async function GET(
	_: unknown,
	{ params: { slug } }: { params: { slug: string } },
) {
	const pageContent = await getWikiPageContent(slug);
	return NextResponse.json(pageContent);
}
