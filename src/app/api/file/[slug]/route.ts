import { getWikiPageContent } from '@/lib/get-wiki-content';
import { NextResponse } from 'next/server';

export async function GET(
	_: unknown,
	{ params: { slug } }: { params: { slug: string } },
) {
	const fileName = (slug || 'README.md').slice(0, 20);
	const pageContent = await getWikiPageContent(fileName);
	return NextResponse.json(pageContent);
}
