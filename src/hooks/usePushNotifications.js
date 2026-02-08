import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(userId) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState('default');
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkStatus = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setIsSupported(false);
        setIsLoading(false);
        return;
      }

      if (!VAPID_PUBLIC_KEY) {
        setIsSupported(false);
        setError('Push notifications not configured');
        setIsLoading(false);
        return;
      }

      setIsSupported(true);
      setPermission(Notification.permission);

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } catch (err) {
        console.error('Error checking push subscription:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, []);

  const subscribe = useCallback(async () => {
    if (!userId || !isSupported) return false;

    setIsLoading(true);
    setError(null);

    try {
      const permResult = await Notification.requestPermission();
      setPermission(permResult);

      if (permResult !== 'granted') {
        setError('Notification permission denied');
        setIsLoading(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subscriptionJSON = subscription.toJSON();

      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh: subscriptionJSON.keys.p256dh,
            auth: subscriptionJSON.keys.auth,
            user_agent: navigator.userAgent.substring(0, 255),
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        );

      if (dbError) throw dbError;

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Error subscribing to push:', err);
      setError(err.message || 'Failed to subscribe');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userId, isSupported]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);

        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error('Error unsubscribing from push:', err);
      setError(err.message || 'Failed to unsubscribe');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    error,
    subscribe,
    unsubscribe,
  };
}

export default usePushNotifications;
