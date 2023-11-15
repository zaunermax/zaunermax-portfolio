import { atom } from 'jotai';
import { AnswerType } from '../types/answer.type';

export const answersAtom = atom([] as AnswerType[]);
export const answerAtom = atom('');
export const answerPendingAtom = atom(false);

export const isAnsweringAtom = atom((get) => get(answerPendingAtom) || !!get(answerAtom));
