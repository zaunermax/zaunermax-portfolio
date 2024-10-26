import { PortableTextProps } from '@portabletext/react';
import { H1, H2, H3, Link, Ol, Paragraph, Ul } from '@/components/text-components';

export const components: PortableTextProps['components'] = {
	block: {
		h1: ({ children }) => <H1>{children}</H1>,
		h2: ({ children }) => <H2>{children}</H2>,
		h3: ({ children }) => <H3>{children}</H3>,
		normal: ({ children }) => <Paragraph>{children}</Paragraph>,
	},
	marks: {
		link: ({ children, value }) => <Link href={value.href as string}>{children}</Link>,
	},
	list: (props) => {
		return props.value.listItem === 'bullet' ? (
			<Ul>{props.children}</Ul>
		) : (
			<Ol>{props.children}</Ol>
		);
	},
};
