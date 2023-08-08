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
