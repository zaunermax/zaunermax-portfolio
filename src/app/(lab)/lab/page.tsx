import Link from 'next/link';
import { spikes } from './_shared/spikes';

export default function LabIndex() {
	return (
		<main className="mx-auto max-w-2xl px-6 py-20 font-sans">
			<h1 className="text-4xl font-bold">
				Redesign lab <span className="text-[#db7093]">·</span> two directions
			</h1>
			<p className="mt-3 text-black/60">
				Each spike is a full landing page with the terminal, wiki, talks and a way to hire Max.
			</p>
			<ul className="mt-10 divide-y divide-black/10 border-y border-black/10">
				{spikes.map((spike, index) => (
					<li key={spike.href}>
						<Link
							href={spike.href}
							className="flex items-baseline gap-4 py-5 outline-none hover:text-[#b5506f] focus-visible:text-[#b5506f]"
						>
							<span className="w-6 text-black/40 tabular-nums">{index + 1}</span>
							<span className="text-2xl font-semibold">{spike.name}</span>
							<span className="text-black/60">{spike.blurb}</span>
						</Link>
					</li>
				))}
			</ul>
		</main>
	);
}
