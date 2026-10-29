/** Relative CMS links still belong to the original portfolio. */
export function legacyUrl(href = '') {
	if (
		!href ||
		href.startsWith('#') ||
		/^[a-z][a-z\d+.-]*:/i.test(href) ||
		href.startsWith('//')
	)
		return href;
	return new URL(href, 'https://zaunermax.at/').href;
}
