import { Badge } from '@/components/ui/badge';

export const Footer = async () => {
	return (
		<footer className="fixed right-0 bottom-1.5 left-0 z-20 container flex">
			<Badge
				variant="secondary"
				className="dark:bg-wiki-body dark:hover:bg-wiki-header mx-auto flex flex-col rounded-xl border-white font-mono text-xs sm:block sm:rounded-full"
			>
				<span className="mx-auto block sm:inline sm:w-auto">
					Made with 💖 by Max Zauner
				</span>
				<span className="hidden sm:inline"> - </span>
				<span className="mx-auto block sm:inline sm:w-auto">
					The code is{' '}
					<a
						className="text-blue-500 underline hover:text-blue-800"
						target="_blank"
						href={'https://github.com/zaunermax/zaunermax-portfolio'}
					>
						open source
					</a>
				</span>
			</Badge>
		</footer>
	);
};
