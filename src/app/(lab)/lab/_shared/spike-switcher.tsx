'use client';

import { Menu } from '@base-ui/react/menu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { spikes } from './spikes';

// Review-only chrome: hop between spikes without going back to the index.
export function SpikeSwitcher() {
	const pathname = usePathname();
	if (pathname === '/lab') return null;
	const current = spikes.find(({ href }) => pathname.startsWith(href));

	return (
		<div className="fixed right-3 bottom-3 z-[1000] font-sans text-sm">
			<Menu.Root>
				<Menu.Trigger className="rounded-full bg-black/80 px-4 py-2 text-white shadow-lg backdrop-blur outline-none hover:bg-black focus-visible:ring-2 focus-visible:ring-[#db7093] focus-visible:ring-offset-2">
					Spike: {current?.name ?? 'lab'}
				</Menu.Trigger>
				<Menu.Portal>
					<Menu.Positioner side="top" align="end" sideOffset={8} className="z-[1001]">
						<Menu.Popup className="min-w-64 rounded-xl bg-white p-1 text-black shadow-xl ring-1 ring-black/10 transition-[opacity,transform] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
							<Menu.Item
								render={<Link href="/lab" />}
								className="block rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-black/5"
							>
								All spikes
							</Menu.Item>
							{spikes.map((spike) => (
								<Menu.Item
									key={spike.href}
									render={<Link href={spike.href} />}
									className="block rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-[#db7093]/15"
								>
									<span className="font-medium">{spike.name}</span>
									<span className="block text-xs text-black/60">{spike.blurb}</span>
								</Menu.Item>
							))}
						</Menu.Popup>
					</Menu.Positioner>
				</Menu.Portal>
			</Menu.Root>
		</div>
	);
}
