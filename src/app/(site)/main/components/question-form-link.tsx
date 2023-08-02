'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

const formSchema = z.object({
	question: z
		.string()
		.min(10, 'The question must be at least 10 characters long')
		.max(100, 'The question cannot be longer than 100 characters'),
});

export const QuestionFormLink = () => {
	const router = useRouter();
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			question: '',
		},
	});

	const onSubmit = useCallback(
		(values: z.infer<typeof formSchema>) => {
			const urlParams = new URLSearchParams();

			urlParams.append('q', values.question);

			router.push(`/main/query?${urlParams.toString()}`);
		},
		[router],
	);

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					render={({ field }) => (
						<FormItem>
							<FormLabel className="sr-only">Ask a question about Max</FormLabel>
							<span className="flex space-x-2">
								<FormControl>
									<Input
										type="text"
										placeholder="Ask a question about Max..."
										{...field}
									/>
								</FormControl>
								<Button variant="secondary" type="submit">
									Ask
								</Button>
							</span>
							<FormDescription className="sr-only">
								The question you type in will take you to another screen where your
								questions will be answered once you submit the form.
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
					name={'question'}
				/>
			</form>
		</Form>
	);
};
