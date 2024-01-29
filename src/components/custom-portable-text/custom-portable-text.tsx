import { PortableText, PortableTextProps } from '@portabletext/react';
import { components } from './portable-text-components';

export type CustomPortableTextProps = {
	value: PortableTextProps['value'];
};

export const CustomPortableText = ({ value }: CustomPortableTextProps) => (
	<PortableText value={value} components={components} />
);
