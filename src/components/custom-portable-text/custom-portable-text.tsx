import { PortableText, type PortableTextBlock } from '@portabletext/react';
import { components } from './portable-text-components';

export type CustomPortableTextProps = {
	value: PortableTextBlock;
};

export const CustomPortableText = ({ value }: CustomPortableTextProps) => (
	<PortableText value={value} components={components} />
);
