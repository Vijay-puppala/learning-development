import { useSyncExternalStore } from 'react';
import { snapshot, subscribe } from './progress';

/** Re-renders any component that cares whenever progress changes. */
export function useProgress() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
