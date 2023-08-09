import { globalRevalidate } from '@/lib/global-revalidate';

export const getFetchErrorHandler =
	<T>() =>
	async (res: Response) => {
		const json = await res.json();
		if (!res.ok) throw new Error(json.message);
		return json as T;
	};

export const getFetchCatchHandler =
	<T>(defaultValue: T) =>
	(e: unknown) => {
		console.error(e);
		return defaultValue;
	};

type FetcherProps<T> = {
	url: string;
	defaultValue: T;
	revalidate?: number;
};

export const doFetch = <ReturnType, DefaultValueType>({
	url,
	revalidate = globalRevalidate,
	defaultValue,
}: FetcherProps<DefaultValueType>): Promise<ReturnType | DefaultValueType> =>
	fetch(url, { next: { revalidate } })
		.then(getFetchErrorHandler<ReturnType>())
		.catch(getFetchCatchHandler(defaultValue));
