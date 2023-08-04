import { PortableTextProps } from '@portabletext/react/src';

export const components: PortableTextProps['components'] = {
	block: {
		h1: ({ children }) => (
			<h1 className="mb-2 border-b-[1px] border-b-white border-opacity-5 pb-2 text-3xl font-semibold">
				{children}
			</h1>
		),
		h2: ({ children }) => (
			<h2 className="mb-2 border-b-[1px] border-b-white border-opacity-5 pb-2 text-2xl font-semibold">
				{children}
			</h2>
		),
		h3: ({ children }) => (
			<h3 className="text-1xl mb-2 border-b-[1px] border-b-white border-opacity-5 pb-2 font-semibold">
				{children}
			</h3>
		),
		normal: ({ children }) => <p className="mb-3">{children}</p>,
	},
	marks: {
		link: ({ children }) => {
			return (
				<a className="text-blue-500 hover:cursor-pointer hover:underline">{children}</a>
			);
		},
	},
	list: (props) => {
		return props.value.listItem === 'bullet' ? (
			<ul className="mb-3 ml-6 list-outside list-disc leading-6">{props.children}</ul>
		) : (
			<ol className="mb-3 ml-6 list-outside list-decimal leading-6">{props.children}</ol>
		);
	},
};
