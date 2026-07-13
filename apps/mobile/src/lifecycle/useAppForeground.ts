/**
 * Foreground-return hook: fires the callback whenever the app comes back
 * from the background. App.tsx uses it to re-check the version policy,
 * refresh remote config (+ reconnect its socket) and refetch stale queries —
 * the mobile equivalent of "the user reopened the tab".
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export function useAppForeground(onForeground: () => void): void {
  const callbackRef = useRef(onForeground);
  useEffect(() => {
    callbackRef.current = onForeground;
  });

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if ((previous === 'inactive' || previous === 'background') && next === 'active') {
        callbackRef.current();
      }
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}
