type Params = {
	baseUrl?: string;
	shortMode?: boolean;
	revalidate?: number;
};

export const getSuggestions = async ({
	shortMode = true,
	baseUrl = '',
	revalidate = 300,
}: Params) => {
	const searchParams = new URLSearchParams();

	searchParams.append('mode', shortMode ? 'short' : 'long');

	return fetch(`${baseUrl}/api/suggestions?${searchParams.toString()}`, {
		next: { revalidate },
	})
		.then((res) => {
			if (!res.ok) return [];
			else return res.json().then(({ suggestions }) => suggestions as string[]);
		})
		.catch((e) => {
			console.error(e);
			return [] as string[];
		});
};
