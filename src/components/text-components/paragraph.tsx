import { ReactNode } from 'react';

export const Paragraph = ({ children }: { children: ReactNode }) => (
	<p className="mb-3">{children}</p>
);
