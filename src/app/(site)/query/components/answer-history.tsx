'use client';

import {
	createContext,
	useContext,
	useState,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from 'react';
import type { AnswerType } from '../types/answer.type';

type History = {
	answers: AnswerType[];
	setAnswers: Dispatch<SetStateAction<AnswerType[]>>;
};
const AnswerHistory = createContext<History | null>(null);

// Keep the terminal transcript across local navigation, without persisting it or sending it to the model.
export function AnswerHistoryProvider({ children }: { children: ReactNode }) {
	const [answers, setAnswers] = useState<AnswerType[]>([]);
	return <AnswerHistory value={{ answers, setAnswers }}>{children}</AnswerHistory>;
}

export function useAnswerHistory() {
	const history = useContext(AnswerHistory);
	if (!history) throw new Error('AnswerHistoryProvider is required');
	return history;
}
