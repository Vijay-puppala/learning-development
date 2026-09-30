import type { Pattern } from './types';
import { p01 } from './patterns/p01';
import { p02 } from './patterns/p02';
import { p03 } from './patterns/p03';
import { p04 } from './patterns/p04';
import { p05 } from './patterns/p05';
import { p06 } from './patterns/p06';
import { p07 } from './patterns/p07';
import { p08 } from './patterns/p08';
import { p09 } from './patterns/p09';
import { p10 } from './patterns/p10';
import { p11 } from './patterns/p11';
import { p12 } from './patterns/p12';
import { p13 } from './patterns/p13';
import { p14 } from './patterns/p14';
import { p15 } from './patterns/p15';
import { p16 } from './patterns/p16';
import { p17 } from './patterns/p17';
import { p18 } from './patterns/p18';

/** All 50 patterns, in the order of the classic interview cheat-sheet. */
export const PATTERNS: Pattern[] = [
  p01,
  p02,
  p03,
  p04,
  p05,
  p06,
  p07,
  p08,
  p09,
  p10,
  p11,
  p12,
  p13,
  p14,
  p15,
  p16,
  p17,
  p18,
];

export const TOTAL_QUESTIONS = PATTERNS.reduce((n, p) => n + p.questions.length, 0);
