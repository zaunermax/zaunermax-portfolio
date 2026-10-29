/** The 405 that Next route handlers sent for methods a route does not define. */
export function methodNotAllowed(...allowed: string[]) {
	return () => new Response(null, { status: 405, headers: { Allow: allowed.join(', ') } });
}
