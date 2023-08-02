import { captureException } from '@sentry/nextjs';

export const getSuggestions = async (baseUrl = '') =>
	fetch(`${baseUrl}/api/suggestions`, { next: { revalidate: 300 } })
		.then((res) => {
			if (!res.ok) return [];
			else return res.json().then(({ suggestions }) => suggestions as string[]);
		})
		.catch((e) => {
			captureException(e);
			return [] as string[];
		});
