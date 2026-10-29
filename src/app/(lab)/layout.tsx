import '../globals.css';
import { ReactNode } from 'react';
import { SpikeSwitcher } from './lab/_shared/spike-switcher';

export const metadata = {
	title: 'Max Zauner – redesign lab',
	robots: { index: false },
};

export const viewport = { width: 'device-width', initialScale: 1 };

// Spikes own their look completely, so this layout skips the site chrome and theme provider.
export default function LabLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-screen antialiased">
				{children}
				<SpikeSwitcher />
			</body>
		</html>
	);
}
