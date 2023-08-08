import { NextResponse } from 'next/server';
import { getWikiContent } from '@/lib/get-wiki-content';

export async function GET() {
	const content = await getWikiContent();
	return NextResponse.json(content);
}

export const runtime = 'edge';
export const revalidate = 300;
