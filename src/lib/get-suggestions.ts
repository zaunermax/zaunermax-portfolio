export const getSuggestions = async (baseUrl = '') =>
	fetch(`${baseUrl}/api/suggestions`, { next: { revalidate: 300 } })
		.then((res) => {
			if (!res.ok) return [];
			else return res.json().then(({ suggestions }) => suggestions as string[]);
		})
		.catch((e) => {
			console.error(e);
			return [] as string[];
		});
