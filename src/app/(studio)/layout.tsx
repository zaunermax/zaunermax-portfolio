import '../globals.css';
import { ReactNode } from 'react';

export const metadata = {
	title: 'Portfolio',
	description: 'Generated by Next + Sanity',
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}