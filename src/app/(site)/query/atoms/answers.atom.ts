import { atom } from 'jotai';
import { AnswerType } from '../types/answer.type';

export const answersAtom = atom([] as AnswerType[]);
export const isAnsweringAtom = atom(false);
