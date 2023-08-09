import { NextResponse } from 'next/server';
import { getWikiContent } from '@/lib/get-wiki-content';
import { globalRevalidate } from '@/lib/global-revalidate';

export async function GET() {
	const content = await getWikiContent();
	return NextResponse.json(content);
}

export const revalidate = globalRevalidate;
