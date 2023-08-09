import { getGeneralInfo } from '@/lib/get-general-info';
import { NextResponse } from 'next/server';
import { globalRevalidate } from '@/lib/global-revalidate';

export async function GET() {
	const res = await getGeneralInfo();
	return NextResponse.json(res);
}

export const revalidate = globalRevalidate;
