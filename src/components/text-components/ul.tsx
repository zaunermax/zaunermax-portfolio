import { ReactNode } from 'react';

export const Ul = (props: { children: ReactNode }) => (
	<ul className="mb-3 ml-6 list-outside list-disc leading-6">{props.children}</ul>
);
