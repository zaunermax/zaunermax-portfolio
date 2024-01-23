import { NotTheFilesYouReLookingFor } from '@/components/file-display';

const Page = () => {
	return (
		<div className="mb-20 mt-20 md:mt-28">
			<NotTheFilesYouReLookingFor filename={'talks'} />
		</div>
	);
};

export default Page;
