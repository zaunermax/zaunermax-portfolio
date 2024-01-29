import { ReactNode } from 'react';

export const Ol = (props: { children: ReactNode }) => (
	<ol className="mb-3 ml-6 list-outside list-decimal leading-6">{props.children}</ol>
);
