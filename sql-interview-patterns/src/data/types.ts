export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  /** Stable id, e.g. "p07-q3". Used as the localStorage progress key. */
  id: string;
  difficulty: Difficulty;
  /** The task, phrased the way an interviewer would ask it. */
  prompt: string;
  /** Tables from the shared schema that the question uses. */
  tables: string[];
  /** Read before revealing anything: what to reason about, not what to type. */
  think: string;
  /** Stage 1 reveal: a nudge. */
  hint: string;
  /** Stage 2 reveal: the plan in plain English, still no syntax. */
  approach: string;
  /** Stage 3 reveal: the SQL. */
  solution: string;
  /** Why the SQL works, and the trap it avoids. */
  explanation: string;
  /** Set when the solution leans on a dialect-specific feature. */
  dialect?: string;
}

export interface Pattern {
  /** 1..50, matching the classic "50 SQL interview patterns" list. */
  num: number;
  /** URL slug. */
  slug: string;
  title: string;
  /** The SQL concept / function this pattern trains. */
  concept: string;
  category: Category;
  /** One line: when an interviewer is really asking for this pattern. */
  tagline: string;
  /** The mental model — read this before the questions. */
  theory: string;
  /** The mistakes that cost people the offer. */
  pitfalls: string[];
  questions: Question[];
}

export type Category =
  | 'Aggregation & Grouping'
  | 'Window Functions'
  | 'Ranking & Top-N'
  | 'Joins & Set Logic'
  | 'Time Series & Dates'
  | 'Reshaping & Text'
  | 'Data Quality & Modeling'
  | 'Performance';

export const CATEGORY_ORDER: Category[] = [
  'Aggregation & Grouping',
  'Ranking & Top-N',
  'Window Functions',
  'Joins & Set Logic',
  'Time Series & Dates',
  'Reshaping & Text',
  'Data Quality & Modeling',
  'Performance',
];
