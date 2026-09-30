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
import { p19 } from './patterns/p19';
import { p20 } from './patterns/p20';
import { p21 } from './patterns/p21';
import { p22 } from './patterns/p22';
import { p23 } from './patterns/p23';
import { p24 } from './patterns/p24';
import { p25 } from './patterns/p25';
import { p26 } from './patterns/p26';
import { p27 } from './patterns/p27';
import { p28 } from './patterns/p28';
import { p29 } from './patterns/p29';
import { p30 } from './patterns/p30';
import { p31 } from './patterns/p31';
import { p32 } from './patterns/p32';
import { p33 } from './patterns/p33';
import { p34 } from './patterns/p34';
import { p35 } from './patterns/p35';

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
  p19,
  p20,
  p21,
  p22,
  p23,
  p24,
  p25,
  p26,
  p27,
  p28,
  p29,
  p30,
  p31,
  p32,
  p33,
  p34,
  p35,
];

export const TOTAL_QUESTIONS = PATTERNS.reduce((n, p) => n + p.questions.length, 0);
