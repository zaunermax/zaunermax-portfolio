import { getGeneralInfo } from '@/lib/get-general-info';
import { NextResponse } from 'next/server';

export async function GET() {
	const res = await getGeneralInfo();
	return NextResponse.json(res);
}

export const runtime = 'edge';
export const revalidate = 300;
