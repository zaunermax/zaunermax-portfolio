export const Footer = async () => {
	return (
		<footer className="container fixed bottom-1.5 left-0 right-0 flex">
			<div className="mx-auto flex flex-col font-mono text-xs sm:block">
				<span className="mx-auto block sm:inline sm:w-auto">
					Made with 💖 by Max Zauner
				</span>
				<span className="hidden sm:inline"> - </span>
				<span className="mx-auto block sm:inline sm:w-auto">
					The code is{' '}
					<a
						className="text-blue-500 underline hover:text-blue-800"
						href={'https://github.com/zaunermax/zaunermax-portfolio'}
					>
						open source
					</a>
				</span>
			</div>
		</footer>
	);
};
