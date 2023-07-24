import { ReactNode } from 'react';
import { AppLayout } from '@/components/app-layout';

export default function MainLayout({ children }: { children: ReactNode }) {
	return <AppLayout>{children}</AppLayout>;
}
