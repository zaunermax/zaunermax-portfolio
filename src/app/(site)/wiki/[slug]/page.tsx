import { NotTheFilesYouReLookingFor } from '@/components/file-display';
import { getWikiContent, getWikiPageContent } from '@/lib/sanity/get-wiki-content';
import { FileContent } from '@/components/file-display';
import { CustomPortableText } from '@/components/custom-portable-text';

export const dynamic = 'force-static';
export const dynamicParams = true;

export const generateStaticParams = async () => {
	const res = await getWikiContent();

	return res.map(({ filename }) => ({ slug: filename }));
};

const Page = async (props: { params: Promise<{ slug: string }> }) => {
	const params = await props.params;
	const res = await getWikiPageContent(params.slug);

	if (!res) return <NotTheFilesYouReLookingFor filename={params.slug} />;

	const { content, ...rest } = res;

	return (
		<FileContent {...rest}>
			<CustomPortableText value={content} />
		</FileContent>
	);
};

export default Page;
