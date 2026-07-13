/**
 * Network reachability — one boolean derived from NetInfo. `null` means
 * "not determined yet" (don't flash the offline banner on cold start).
 */
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function useNetworkStatus(): { isOffline: boolean } {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return unsubscribe;
  }, []);

  return { isOffline: isConnected === false };
}
