import { ReactNode } from 'react';

export const H1 = ({ children }: { children: ReactNode }) => (
	<h1 className="mb-2 border-b-[1px] border-b-white border-opacity-5 pb-2 text-3xl font-semibold">
		{children}
	</h1>
);
