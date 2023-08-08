import { getWikiPageContent } from '@/lib/get-wiki-content';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const fileName = (searchParams.get('slug') || 'README.md').slice(0, 20);

	const pageContent = await getWikiPageContent(fileName);

	return NextResponse.json(pageContent);
}

export const runtime = 'edge';
