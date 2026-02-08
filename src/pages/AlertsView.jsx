// ============================================================================
// ALERTS VIEW
// ============================================================================
// Page showing user notifications/alerts for @mentions
// Users can see who mentioned them and navigate to the source
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellRing, Check, CheckCheck, Ship, MessageSquare, Clock, Wrench, ExternalLink, X } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { notificationsService } from '../services/supabaseService';
import { usePushNotifications } from '../hooks/usePushNotifications';

// Time ago helper
function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

// Source type labels and icons
const SOURCE_CONFIG = {
  'boat_note': { label: 'Boat Note', icon: Ship, color: 'text-blue-600 bg-blue-100' },
  'inventory_boat_note': { label: 'Inventory Note', icon: Ship, color: 'text-purple-600 bg-purple-100' },
  'request_message': { label: 'Request Message', icon: Wrench, color: 'text-orange-600 bg-orange-100' },
};

// Notification card component
function NotificationCard({ notification, onMarkRead, onNavigate }) {
  const config = SOURCE_CONFIG[notification.source_type] || {};
  const Icon = config.icon || MessageSquare;
  const isRead = !!notification.read_at;

  // Build description based on source
  let sourceDescription = '';
  if (notification.boat) {
    sourceDescription = notification.boat.name;
  } else if (notification.inventory_boat) {
    const ib = notification.inventory_boat;
    sourceDescription = `${ib.year || ''} ${ib.make || ''} ${ib.model || ''}`.trim() || `Stock #${ib.stock_number}`;
  } else if (notification.request) {
    sourceDescription = notification.request.type === 'rigging' ? 'Rigging Request' : 'Prep Request';
  }

  const handleClick = () => {
    if (!isRead) {
      onMarkRead(notification.id);
    }
    onNavigate(notification);
  };

  return (
    <div
      onClick={handleClick}
      className={`p-4 border rounded-xl cursor-pointer transition-all hover:shadow-md ${
        isRead
          ? 'bg-white border-slate-200 opacity-70'
          : 'bg-blue-50 border-blue-200 shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`p-2 rounded-lg ${config.color || 'text-slate-600 bg-slate-100'}`}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.color || 'text-slate-600 bg-slate-100'}`}>
              {config.label || notification.source_type}
            </span>
            {!isRead && (
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </div>

          <p className="text-sm text-slate-900 font-medium">
            <span className="text-blue-600">{notification.created_by_user?.name || 'Someone'}</span>
            {' '}mentioned you
          </p>

          {sourceDescription && (
            <p className="text-xs text-slate-500 mt-0.5">
              in {sourceDescription}
            </p>
          )}

          {notification.message_preview && (
            <p className="text-sm text-slate-600 mt-2 line-clamp-2 italic">
              "{notification.message_preview}"
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {getTimeAgo(notification.created_at)}
            </span>
            {isRead && (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="w-3 h-3" />
                Read
              </span>
            )}
          </div>
        </div>

        {/* Action indicator */}
        <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </div>
    </div>
  );
}

export function AlertsView({
  onNavigateToBoat,
  onNavigateToInventoryBoat,
  onNavigateToRequest,
}) {
  const { currentUser } = usePermissions();
  const push = usePushNotifications(currentUser?.id);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(
    () => localStorage.getItem('bbg-push-banner-dismissed') === 'true'
  );

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRead, setShowRead] = useState(false);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!currentUser?.id) return;

    setLoading(true);
    try {
      const data = await notificationsService.getForUser(currentUser.id, showRead);
      setNotifications(data);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, showRead]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Mark as read
  const handleMarkRead = async (notificationId) => {
    try {
      await notificationsService.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? { ...n, read_at: new Date().toISOString() }
            : n
        )
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    if (!currentUser?.id) return;

    try {
      await notificationsService.markAllAsRead(currentUser.id);
      setNotifications(prev =>
        prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  // Navigate to source
  const handleNavigate = (notification) => {
    if (notification.boat_id && onNavigateToBoat) {
      onNavigateToBoat(notification.boat_id);
    } else if (notification.inventory_boat_id && onNavigateToInventoryBoat) {
      onNavigateToInventoryBoat(notification.inventory_boat_id);
    } else if (notification.request_id && onNavigateToRequest) {
      onNavigateToRequest(notification.request_id);
    }
  };

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl">
            <Bell className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Alerts</h1>
            <p className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showRead}
              onChange={(e) => setShowRead(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Show read
          </label>
        </div>
      </div>

      {/* Push notification prompt */}
      {push.isSupported && !push.isSubscribed && !pushBannerDismissed && !push.isLoading && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BellRing className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-blue-900 text-sm">Enable push notifications</p>
              <p className="text-xs text-blue-700">Get notified on your device when someone @mentions you</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={async () => {
                const success = await push.subscribe();
                if (success) setPushBannerDismissed(true);
              }}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Enable
            </button>
            <button
              onClick={() => {
                setPushBannerDismissed(true);
                localStorage.setItem('bbg-push-banner-dismissed', 'true');
              }}
              className="p-1 text-blue-400 hover:text-blue-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Notifications list */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">
          Loading alerts...
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {showRead ? 'No notifications yet' : 'No unread notifications'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            You'll see alerts here when someone @mentions you
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkRead={handleMarkRead}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default AlertsView;
