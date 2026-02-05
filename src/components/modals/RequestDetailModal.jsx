// ============================================================================
// REQUEST DETAIL MODAL
// ============================================================================
// Modal for viewing request details, message thread, and status actions
// Service can mark complete, original requester can confirm completion
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { X, Send, Wrench, CheckCircle, Clock, Ship, User } from 'lucide-react';

// Status configuration
const STATUS_CONFIG = {
  'open': { label: 'Open', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Clock },
  'service-complete': { label: 'Service Complete', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: Wrench },
  'closed': { label: 'Closed', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
};

const TYPE_CONFIG = {
  'rigging': { label: 'Rigging', color: 'bg-purple-100 text-purple-800' },
  'prep': { label: 'Prep', color: 'bg-orange-100 text-orange-800' },
};

// Message component
function Message({ message, isCurrentUser }) {
  return (
    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2 ${
          isCurrentUser
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-900'
        }`}
      >
        {!isCurrentUser && (
          <p className="text-xs font-medium mb-1 opacity-75">
            {message.user?.name || 'Unknown'}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.message}</p>
        <p className={`text-xs mt-1 ${isCurrentUser ? 'text-blue-200' : 'text-slate-500'}`}>
          {new Date(message.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function RequestDetailModal({
  request,
  currentUser,
  onClose,
  onAddMessage,
  onMarkServiceComplete,
  onConfirmComplete,
}) {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const messagesEndRef = useRef(null);

  const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG['open'];
  const typeConfig = TYPE_CONFIG[request.type] || TYPE_CONFIG['rigging'];
  const StatusIcon = statusConfig.icon;

  const messages = request.messages || [];
  const boat = request.inventory_boat;
  const boatName = boat
    ? `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim()
    : 'No boat linked';

  // Check if current user is the original requester
  const isOriginalRequester = currentUser?.id === request.created_by;

  // Scroll to bottom of messages when they change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      await onAddMessage(request.id, newMessage.trim());
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleMarkServiceComplete = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      await onMarkServiceComplete(request.id);
    } catch (err) {
      console.error('Error marking service complete:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmComplete = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      await onConfirmComplete(request.id);
    } catch (err) {
      console.error('Error confirming complete:', err);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {/* Type and Status badges */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeConfig.color}`}>
                  {typeConfig.label}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${statusConfig.color}`}>
                  <StatusIcon className="w-3 h-3 inline mr-1" />
                  {statusConfig.label}
                </span>
              </div>

              {/* Boat name */}
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Ship className="w-5 h-5" />
                {boatName}
              </h3>

              {/* Stock number if available */}
              {boat?.stock_number && (
                <p className="text-slate-300 text-sm mt-0.5">
                  Stock #{boat.stock_number}
                  {boat.hull_id && ` | HIN: ${boat.hull_id}`}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-600 rounded transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Request Info */}
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-900">
                  {request.creator?.name || 'Unknown'}
                </span>
                <span className="text-slate-400">
                  {new Date(request.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-slate-700 mt-1 whitespace-pre-wrap">{request.description}</p>
            </div>
          </div>

          {/* Completion info */}
          {request.status === 'service-complete' && request.service_completer && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <Wrench className="w-4 h-4 inline mr-1" />
                Service marked complete by <strong>{request.service_completer.name}</strong>
                {request.service_completed_at && (
                  <> on {new Date(request.service_completed_at).toLocaleString()}</>
                )}
              </p>
            </div>
          )}

          {request.status === 'closed' && request.confirmer && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                Confirmed complete by <strong>{request.confirmer.name}</strong>
                {request.confirmed_at && (
                  <> on {new Date(request.confirmed_at).toLocaleString()}</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white min-h-[200px]">
          {messages.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No messages yet. Start the conversation!</p>
          ) : (
            messages
              .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
              .map((msg) => (
                <Message
                  key={msg.id}
                  message={msg}
                  isCurrentUser={msg.user_id === currentUser?.id}
                />
              ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        {request.status !== 'closed' && (
          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                rows={2}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                disabled={sending}
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors self-end"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-4 border-t border-slate-200 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>

          {/* Mark Service Complete - visible when open */}
          {request.status === 'open' && (
            <button
              onClick={handleMarkServiceComplete}
              disabled={updating}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Wrench className="w-4 h-4" />
              {updating ? 'Updating...' : 'Mark Service Complete'}
            </button>
          )}

          {/* Confirm Complete - visible to original requester when service-complete */}
          {request.status === 'service-complete' && isOriginalRequester && (
            <button
              onClick={handleConfirmComplete}
              disabled={updating}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {updating ? 'Updating...' : 'Confirm Complete'}
            </button>
          )}

          {/* Info for non-requesters when awaiting confirmation */}
          {request.status === 'service-complete' && !isOriginalRequester && (
            <div className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 font-medium rounded-lg text-center text-sm">
              Awaiting confirmation from {request.creator?.name || 'requester'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RequestDetailModal;
