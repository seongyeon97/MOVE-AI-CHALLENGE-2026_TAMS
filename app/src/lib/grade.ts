// grade.ts — GRADE_META는 scripts/lib/constants.mjs 하나에서만 나온다.
// 빌드 스크립트(Node)와 프론트(브라우저) 둘 다 이 파일 하나를 가져다 쓴다 — 여기서 재매핑하지 않는다.
import { GRADE_META as RAW_GRADE_META } from '../../scripts/lib/constants.mjs';
import type { Grade, Settle, Tone } from '../types';

type GradeMetaEntry = {
  label: string;
  tone: Tone;
  verifiable: boolean;
  settle: Settle;
  verdict: string;
};

export const GRADE_META: Record<Grade, GradeMetaEntry> = RAW_GRADE_META as unknown as Record<Grade, GradeMetaEntry>;

export const GRADE_ORDER: Grade[] = ['정상', 'A', 'B', 'C', 'D'];
