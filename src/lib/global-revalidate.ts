const envRevalidateNum = Number(process.env.NEXT_PUBLIC_REVALIDATE);

export const globalRevalidate = !isNaN(envRevalidateNum)
	? Math.abs(envRevalidateNum)
	: 300;
