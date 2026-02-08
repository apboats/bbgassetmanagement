import { useState } from 'react';
import { Bell, BellOff, Smartphone, AlertTriangle } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

export function PushNotificationSettings({ userId }) {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotifications(userId);

  const [actionLoading, setActionLoading] = useState(false);

  const handleToggle = async () => {
    setActionLoading(true);
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
    setActionLoading(false);
  };

  if (!isSupported) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <div>
            <p className="font-medium text-amber-900">Push notifications not available</p>
            <p className="text-sm text-amber-700 mt-1">
              Your browser does not support push notifications, or the feature is not configured.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-3">
          <BellOff className="w-5 h-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Notifications blocked</p>
            <p className="text-sm text-red-700 mt-1">
              You have blocked notifications for this site. To re-enable, update your browser
              settings for this site and then refresh the page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isSubscribed ? 'bg-green-100' : 'bg-slate-200'}`}>
            {isSubscribed
              ? <Bell className="w-5 h-5 text-green-600" />
              : <BellOff className="w-5 h-5 text-slate-500" />
            }
          </div>
          <div>
            <p className="font-medium text-slate-900">Push Notifications</p>
            <p className="text-sm text-slate-600">
              {isSubscribed
                ? 'You will receive notifications when someone @mentions you'
                : 'Enable to get notified when someone @mentions you'
              }
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={isLoading || actionLoading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isSubscribed ? 'bg-blue-600' : 'bg-slate-300'
          } ${(isLoading || actionLoading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isSubscribed ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {isSubscribed && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Smartphone className="w-4 h-4" />
          <span>Notifications enabled on this device</span>
        </div>
      )}
    </div>
  );
}

export default PushNotificationSettings;
