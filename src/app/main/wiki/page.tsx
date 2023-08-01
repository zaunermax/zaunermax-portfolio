import { getCVUrl } from '@/lib/get-person';
import { Button } from '@/components/ui/button';

export const revalidate = 300;

const Page = async () => {
	const { fileUrl } = await getCVUrl();

	return (
		<div className="flex min-h-screen items-center justify-center">
			<Button asChild className="mx-auto" size="lg">
				<a href={fileUrl} target="_blank" rel="noopener noreferrer">
					Download CV
				</a>
			</Button>
		</div>
	);
};

export default Page;
