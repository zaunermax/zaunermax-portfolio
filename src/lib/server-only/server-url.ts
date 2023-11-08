import 'server-only';

const protocol = process.env['HTTP_PROTOCOL'] ?? 'http';
const host = process.env['BASE_DOMAIN'] ?? process.env['VERCEL_URL'] ?? 'localhost:3000';

export const serverURL = `${protocol}://${host}`;
