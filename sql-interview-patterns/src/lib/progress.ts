/**
 * Per-question progress, kept in localStorage so the site stays a static
 * deploy with no backend. Every read is defensive: private windows, cleared
 * site data and storage-blocking browsers all have to render fine.
 */
const KEY = 'sqlpat.progress.v1';

export type QuestionState = 'unseen' | 'solved' | 'peeked';

type Store = Record<string, QuestionState>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — progress is a convenience, never a requirement */
  }
}

const listeners = new Set<() => void>();
let cache: Store | null = null;

function store(): Store {
  if (cache === null) cache = read();
  return cache;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(id: string): QuestionState {
  return store()[id] ?? 'unseen';
}

export function setState(id: string, state: QuestionState) {
  const next = { ...store() };
  if (state === 'unseen') delete next[id];
  else next[id] = state;
  cache = next;
  write(next);
  listeners.forEach((fn) => fn());
}

export function snapshot(): Store {
  return store();
}

export function resetAll() {
  cache = {};
  write({});
  listeners.forEach((fn) => fn());
}

export function countFor(ids: string[]): { solved: number; peeked: number } {
  const s = store();
  let solved = 0;
  let peeked = 0;
  for (const id of ids) {
    if (s[id] === 'solved') solved += 1;
    else if (s[id] === 'peeked') peeked += 1;
  }
  return { solved, peeked };
}
