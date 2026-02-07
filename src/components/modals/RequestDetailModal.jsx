// ============================================================================
// REQUEST DETAIL MODAL
// ============================================================================
// Modal for viewing request details, message thread, and status actions
// Includes status selector and PDF attachment support
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { X, Wrench, CheckCircle, Clock, Ship, User, Calendar, FileText, Upload, Trash2, ExternalLink, DollarSign, AlertTriangle } from 'lucide-react';
import { estimatesService } from '../../services/supabaseService';
import { EstimateDetailsModal } from './EstimateDetailsModal';
import { MentionInput, renderMessageWithMentions } from '../MentionInput';
import { usePermissions } from '../../hooks/usePermissions';

// Compute hash from estimates for change detection
const computeEstimatesHash = (estimates) => {
  if (!estimates || estimates.length === 0) return null;
  const sorted = [...estimates].sort((a, b) => a.id - b.id);
  return sorted.map(e => `${e.id}:${e.total_charges || 0}`).join('|');
};

// Status configuration - matches RequestsView
const STATUS_CONFIG = {
  'open': { label: 'Open', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Clock },
  'scheduled': { label: 'Scheduled', color: 'bg-cyan-100 text-cyan-800 border-cyan-300', icon: Calendar },
  'service-complete': { label: 'Service Complete', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: Wrench },
  'closed': { label: 'Closed', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
};

const STATUS_ORDER = ['open', 'scheduled', 'service-complete', 'closed'];

const TYPE_CONFIG = {
  'rigging': { label: 'Rigging', color: 'bg-purple-100 text-purple-800' },
  'prep': { label: 'Prep', color: 'bg-orange-100 text-orange-800' },
};

// Message component
function Message({ message, isCurrentUser, currentUserId }) {
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
        <p className="text-sm">
          {renderMessageWithMentions(message.message, currentUserId)}
        </p>
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
  users = [],
  onClose,
  onAddMessage,
  onMarkServiceComplete,
  onConfirmComplete,
  onStatusChange,
  onAttachFile,
  onRemoveAttachment,
  onApproveEstimates,
}) {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [estimates, setEstimates] = useState([]);
  const [loadingEstimates, setLoadingEstimates] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [selectedEstimateIndex, setSelectedEstimateIndex] = useState(0);
  const [approvingEstimates, setApprovingEstimates] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const { isSalesManager, isAdmin } = usePermissions();

  const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG['open'];
  const typeConfig = TYPE_CONFIG[request.type] || TYPE_CONFIG['rigging'];
  const StatusIcon = statusConfig.icon;

  const messages = request.messages || [];
  const boat = request.inventory_boat;

  // Local state for approval (updates immediately after approval)
  const [approvalData, setApprovalData] = useState({
    approved_by: boat?.estimates_approved_by,
    approved_at: boat?.estimates_approved_at,
    approval_hash: boat?.estimates_approval_hash,
  });
  const boatName = boat
    ? `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim()
    : 'No boat linked';

  // Check if current user is the original requester
  const isOriginalRequester = currentUser?.id === request.created_by;

  // Scroll to bottom of messages when they change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load estimates when modal opens (if boat has dockmaster_id)
  useEffect(() => {
    const loadEstimates = async () => {
      const dockmasterId = boat?.dockmaster_id || boat?.dockmasterId;
      if (!dockmasterId) return;

      setLoadingEstimates(true);
      try {
        const data = await estimatesService.getForInventoryBoat(dockmasterId);
        setEstimates(data);
      } catch (err) {
        console.error('Error loading estimates:', err);
      } finally {
        setLoadingEstimates(false);
      }
    };

    loadEstimates();
  }, [boat?.dockmaster_id, boat?.dockmasterId]);

  const handleSendMessage = async (messageText) => {
    // Use passed text (from MentionInput) or fall back to state
    const text = messageText || newMessage;
    if (!text.trim() || sending) return;

    setSending(true);
    try {
      await onAddMessage(request.id, text.trim());
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
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

  const handleStatusChange = async (newStatus) => {
    if (updating || newStatus === request.status) return;
    setUpdating(true);
    try {
      if (onStatusChange) {
        await onStatusChange(request.id, newStatus);
      }
    } catch (err) {
      console.error('Error changing status:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || uploading) return;

    // Validate file type (PDF only)
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    try {
      if (onAttachFile) {
        await onAttachFile(request.id, file);
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
      // Clear the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = async (attachmentId) => {
    if (!confirm('Remove this attachment?')) return;
    try {
      if (onRemoveAttachment) {
        await onRemoveAttachment(request.id, attachmentId);
      }
    } catch (err) {
      console.error('Error removing attachment:', err);
    }
  };

  const handleApproveEstimates = async () => {
    if (approvingEstimates || !onApproveEstimates) return;
    setApprovingEstimates(true);
    try {
      const hash = computeEstimatesHash(estimates);
      await onApproveEstimates(request.id, hash);
      // Update local state immediately so UI reflects the change
      setApprovalData({
        approved_by: currentUser?.id,
        approved_at: new Date().toISOString(),
        approval_hash: hash,
      });
    } catch (err) {
      console.error('Error approving estimates:', err);
    } finally {
      setApprovingEstimates(false);
    }
  };

  // Handle estimate navigation
  const handleEstimateNavigate = (index) => {
    if (index >= 0 && index < estimates.length) {
      setSelectedEstimateIndex(index);
      setSelectedEstimate(estimates[index]);
    }
  };

  const attachments = request.attachments || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white p-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {/* Type badge only - status selector moved below header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeConfig.color}`}>
                  {typeConfig.label}
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

        {/* Status Selector - Prominent horizontal pills */}
        <div className="p-3 bg-white border-b border-slate-200">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {STATUS_ORDER.map(status => {
              const config = STATUS_CONFIG[status];
              const StatusIconBtn = config.icon;
              const isActive = request.status === status;

              return (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  disabled={updating}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium text-sm transition-all ${
                    isActive
                      ? `${config.color} ring-2 ring-offset-1 ring-current`
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <StatusIconBtn className="w-4 h-4" />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Boat Details - Comprehensive info for service team */}
        {boat && (
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <Ship className="w-5 h-5 text-blue-600" />
              <h4 className="font-semibold text-blue-900">Boat Details</h4>
            </div>

            {/* Boat name (prominent) */}
            <p className="text-lg font-bold text-slate-900 mb-3">
              {boat.year || ''} {boat.make || ''} {boat.model || ''}
            </p>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {boat.stock_number && (
                <div className="p-2 bg-white rounded border border-blue-100">
                  <p className="text-xs text-slate-500">Stock #</p>
                  <p className="font-mono font-semibold text-slate-900">{boat.stock_number}</p>
                </div>
              )}
              {(boat.dockmaster_id || boat.dockmasterId) && (
                <div className="p-2 bg-white rounded border border-blue-100">
                  <p className="text-xs text-slate-500">Dockmaster ID</p>
                  <p className="font-mono font-semibold text-slate-900">
                    {boat.dockmaster_id || boat.dockmasterId}
                  </p>
                </div>
              )}
              {(boat.hull_id || boat.hullId) && (
                <div className="p-2 bg-white rounded border border-blue-100">
                  <p className="text-xs text-slate-500">Hull ID (HIN)</p>
                  <p className="font-mono font-semibold text-slate-900">
                    {boat.hull_id || boat.hullId}
                  </p>
                </div>
              )}
              {boat.color && (
                <div className="p-2 bg-white rounded border border-blue-100">
                  <p className="text-xs text-slate-500">Color</p>
                  <p className="font-semibold text-slate-900">{boat.color}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dockmaster Estimates Section - Simplified */}
        {loadingEstimates && (
          <div className="p-4 text-center text-slate-500 bg-amber-50 border-b border-amber-200">
            Loading estimates...
          </div>
        )}

        {!loadingEstimates && estimates.length > 0 && (
          <div className="p-4 bg-amber-50 border-b border-amber-200">
            {/* Header with count and total */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-600" />
                <h4 className="font-semibold text-amber-900">Dockmaster Estimates</h4>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full">
                  {estimates.length}
                </span>
              </div>
              <p className="text-lg font-bold text-amber-700">
                ${estimates.reduce((sum, e) => sum + (e.total_charges || 0), 0)
                  .toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Review Estimates button */}
            <button
              onClick={() => {
                setSelectedEstimateIndex(0);
                setSelectedEstimate(estimates[0]);
              }}
              className="mt-3 w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Review Estimates ({estimates.length})
            </button>

            {/* Approval Status - uses local state for immediate updates */}
            {(() => {
              const currentHash = computeEstimatesHash(estimates);
              const isApproved = approvalData.approved_by &&
                                 approvalData.approval_hash === currentHash;
              const hasChanged = approvalData.approved_by &&
                                 approvalData.approval_hash !== currentHash;

              if (isApproved) {
                return (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-800">
                      <CheckCircle className="w-4 h-4" />
                      <span className="font-medium">Estimates Approved</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      Approved on {new Date(approvalData.approved_at).toLocaleString()}
                    </p>
                  </div>
                );
              }

              if (hasChanged) {
                return (
                  <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2 text-orange-800">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">Estimates Changed</span>
                    </div>
                    <p className="text-sm text-orange-700 mt-1">
                      Previous approval is no longer valid. Estimates have been modified.
                    </p>
                    {(isSalesManager || isAdmin) && (
                      <button
                        onClick={handleApproveEstimates}
                        disabled={approvingEstimates}
                        className="mt-2 w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {approvingEstimates ? 'Approving...' : 'Re-Approve Estimates'}
                      </button>
                    )}
                  </div>
                );
              }

              // Not approved yet
              if (isSalesManager || isAdmin) {
                return (
                  <button
                    onClick={handleApproveEstimates}
                    disabled={approvingEstimates}
                    className="mt-3 w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {approvingEstimates ? 'Approving...' : 'Approve Estimates'}
                  </button>
                );
              }

              return (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 text-center">
                    Awaiting sales manager approval
                  </p>
                </div>
              );
            })()}
          </div>
        )}

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

              {/* Deadline date display */}
              {request.deadline_date && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <span className="text-slate-600">
                    Due: <span className="font-medium text-amber-700">{new Date(request.deadline_date).toLocaleDateString()}</span>
                  </span>
                </div>
              )}
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

          {/* PDF Attachments Section */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Attachments
              </h4>
              {request.status !== 'closed' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-3 h-3" />
                    {uploading ? 'Uploading...' : 'Attach PDF'}
                  </button>
                </>
              )}
            </div>

            {attachments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-3">No attachments</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg"
                  >
                    <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {attachment.filename || 'Document.pdf'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {attachment.uploaded_by?.name || 'Unknown'} • {new Date(attachment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Open PDF"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {request.status !== 'closed' && (
                        <button
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Remove attachment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                  currentUserId={currentUser?.id}
                />
              ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        {request.status !== 'closed' && (
          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <MentionInput
              value={newMessage}
              onChange={setNewMessage}
              onSubmit={handleSendMessage}
              users={users}
              placeholder="Type a message... Use @ to mention someone"
              disabled={sending}
              submitDisabled={!newMessage.trim() || sending}
              rows={2}
            />
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

      {/* Estimate Details Modal with navigation */}
      {selectedEstimate && (
        <EstimateDetailsModal
          estimate={selectedEstimate}
          allEstimates={estimates}
          currentIndex={selectedEstimateIndex}
          onNavigate={handleEstimateNavigate}
          onClose={() => setSelectedEstimate(null)}
        />
      )}
    </div>
  );
}

export default RequestDetailModal;
