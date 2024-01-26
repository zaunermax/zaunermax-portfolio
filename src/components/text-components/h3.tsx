import { ReactNode } from 'react';

export const H3 = ({ children }: { children: ReactNode }) => (
	<h3 className="text-1xl mb-2 border-b-[1px] border-b-white border-opacity-5 pb-2 font-semibold">
		{children}
	</h3>
);
