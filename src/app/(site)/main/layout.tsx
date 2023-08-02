import { ReactNode } from 'react';
import { AppLayout } from '@/components/app-layout';
import { Footer } from './components/footer';

export default function MainLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<AppLayout>{children}</AppLayout>
			<Footer />
		</>
	);
}
