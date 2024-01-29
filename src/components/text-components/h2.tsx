import { ReactNode } from 'react';

export const H2 = ({ children }: { children: ReactNode }) => (
	<h2 className="mb-2 border-b-[1px] border-b-white border-opacity-5 pb-2 text-2xl font-semibold">
		{children}
	</h2>
);
