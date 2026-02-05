// ============================================================================
// REQUESTS VIEW
// ============================================================================
// Page for viewing and managing service requests between sales and service teams
// Sales Managers can create rigging/prep requests linked to inventory boats
// Service team can mark complete, sales confirms completion
// Supports drag-and-drop between status columns
// ============================================================================

import { useState, useMemo, useCallback } from 'react';
import { Plus, Filter, MessageSquare, Wrench, CheckCircle, Clock, Archive, Calendar } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { RequestModal } from '../components/modals/RequestModal';
import { RequestDetailModal } from '../components/modals/RequestDetailModal';

// Status configuration - order matters for the kanban board
const STATUS_CONFIG = {
  'open': { label: 'Open', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', borderColor: 'border-yellow-400', icon: Clock, iconColor: 'text-yellow-600', bgHover: 'bg-yellow-50' },
  'scheduled': { label: 'Scheduled', color: 'bg-cyan-100 text-cyan-800 border-cyan-300', borderColor: 'border-cyan-400', icon: Calendar, iconColor: 'text-cyan-600', bgHover: 'bg-cyan-50' },
  'service-complete': { label: 'Service Complete', color: 'bg-blue-100 text-blue-800 border-blue-300', borderColor: 'border-blue-400', icon: Wrench, iconColor: 'text-blue-600', bgHover: 'bg-blue-50' },
  'closed': { label: 'Closed', color: 'bg-green-100 text-green-800 border-green-300', borderColor: 'border-green-400', icon: CheckCircle, iconColor: 'text-green-600', bgHover: 'bg-green-50' },
};

// Ordered list of statuses for the kanban columns
const STATUS_ORDER = ['open', 'scheduled', 'service-complete', 'closed'];

const TYPE_CONFIG = {
  'rigging': { label: 'Rigging', color: 'bg-purple-100 text-purple-800' },
  'prep': { label: 'Prep', color: 'bg-orange-100 text-orange-800' },
};

// Request Card Component with drag support
function RequestCard({ request, onClick, onDragStart, onDragEnd }) {
  const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG['open'];
  const typeConfig = TYPE_CONFIG[request.type] || TYPE_CONFIG['rigging'];
  const StatusIcon = statusConfig.icon;
  const messageCount = request.messages?.length || 0;
  const boatName = request.inventory_boat
    ? `${request.inventory_boat.year || ''} ${request.inventory_boat.make || ''} ${request.inventory_boat.model || ''}`.trim()
    : 'No boat linked';

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', request.id);
    if (onDragStart) onDragStart(request);
  };

  const handleDragEnd = () => {
    if (onDragEnd) onDragEnd();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      className="w-full p-4 bg-white rounded-xl border-2 border-slate-200 hover:border-blue-300 hover:shadow-md transition-all text-left cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-3">
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
          <h3 className="font-semibold text-slate-900 truncate">{boatName}</h3>

          {/* Stock number if available */}
          {request.inventory_boat?.stock_number && (
            <p className="text-xs text-slate-500 mt-0.5">
              Stock #{request.inventory_boat.stock_number}
            </p>
          )}

          {/* Description preview */}
          <p className="text-sm text-slate-600 mt-2 line-clamp-2">{request.description}</p>

          {/* Footer info */}
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span>By {request.creator?.name || 'Unknown'}</span>
            <span>{new Date(request.created_at).toLocaleDateString()}</span>
            {messageCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {messageCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Kanban Column Component with drop support
function KanbanColumn({ status, requests, onSelectRequest, onDragStart, onDragEnd, onDrop, isDragOver }) {
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const requestId = e.dataTransfer.getData('text/plain');
    if (onDrop) onDrop(requestId, status);
  };

  return (
    <div
      className={`space-y-3 min-h-[200px] rounded-lg transition-colors ${isDragOver ? config.bgHover : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className={`flex items-center gap-2 pb-2 border-b-2 ${config.borderColor}`}>
        <StatusIcon className={`w-5 h-5 ${config.iconColor}`} />
        <h2 className="font-semibold text-slate-900">{config.label}</h2>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
          {requests.length}
        </span>
      </div>
      <div className="space-y-3">
        {requests.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            {status === 'open' ? 'No open requests' :
             status === 'scheduled' ? 'Nothing scheduled' :
             status === 'service-complete' ? 'None awaiting confirmation' :
             'No closed requests'}
          </p>
        ) : (
          requests.map(request => (
            <RequestCard
              key={request.id}
              request={request}
              onClick={() => onSelectRequest(request)}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function RequestsView({
  requests = [],
  inventoryBoats = [],
  currentUser,
  onCreateRequest,
  onUpdateRequest,
  onAddMessage,
  onMarkServiceComplete,
  onConfirmComplete,
}) {
  const { canCreateRequests } = usePermissions();

  // State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [filterType, setFilterType] = useState('all'); // all, rigging, prep
  const [filterStatus, setFilterStatus] = useState('active'); // active, closed, all
  const [showArchived, setShowArchived] = useState(false);
  const [dragOverStatus, setDragOverStatus] = useState(null);

  // Get the selected request from the requests array (ensures fresh data)
  const selectedRequest = useMemo(() => {
    if (!selectedRequestId) return null;
    return requests.find(r => r.id === selectedRequestId) || null;
  }, [requests, selectedRequestId]);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // Type filter
      if (filterType !== 'all' && req.type !== filterType) return false;

      // Status filter
      if (filterStatus === 'active' && req.status === 'closed') return false;
      if (filterStatus === 'closed' && req.status !== 'closed') return false;

      // Archived filter
      if (!showArchived && req.archived_at) return false;

      return true;
    });
  }, [requests, filterType, filterStatus, showArchived]);

  // Group by status for kanban-style view
  const groupedRequests = useMemo(() => {
    const groups = {};
    STATUS_ORDER.forEach(status => {
      groups[status] = filteredRequests.filter(r => r.status === status);
    });
    return groups;
  }, [filteredRequests]);

  // Handlers
  const handleCreateRequest = async (requestData) => {
    if (onCreateRequest) {
      await onCreateRequest({
        ...requestData,
        created_by: currentUser?.id,
      });
    }
    setShowCreateModal(false);
  };

  const handleSelectRequest = (request) => {
    setSelectedRequestId(request.id);
  };

  const handleCloseDetail = () => {
    setSelectedRequestId(null);
  };

  const handleAddMessage = async (requestId, message) => {
    if (onAddMessage) {
      await onAddMessage(requestId, currentUser?.id, message);
    }
  };

  const handleMarkServiceComplete = async (requestId) => {
    if (onMarkServiceComplete) {
      await onMarkServiceComplete(requestId, currentUser?.id);
    }
  };

  const handleConfirmComplete = async (requestId) => {
    if (onConfirmComplete) {
      await onConfirmComplete(requestId, currentUser?.id);
    }
  };

  // Drag and drop handlers
  const handleDragStart = useCallback(() => {
    // Could add visual feedback here if needed
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragOverStatus(null);
  }, []);

  const handleDrop = useCallback(async (requestId, newStatus) => {
    const request = requests.find(r => r.id === requestId);
    if (!request || request.status === newStatus) {
      setDragOverStatus(null);
      return;
    }

    // Update the request status
    if (onUpdateRequest) {
      try {
        await onUpdateRequest(requestId, { status: newStatus });
      } catch (error) {
        console.error('Error updating request status:', error);
      }
    }

    setDragOverStatus(null);
  }, [requests, onUpdateRequest]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Service Requests</h1>
          <p className="text-slate-600 text-sm mt-1">
            Sales-to-service collaboration for rigging and prep work
          </p>
        </div>

        {canCreateRequests && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Request
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-xl">
        <Filter className="w-5 h-5 text-slate-500" />

        {/* Type Filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Types</option>
          <option value="rigging">Rigging</option>
          <option value="prep">Prep</option>
        </select>

        {/* Status Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="all">All Status</option>
        </select>

        {/* Archived Toggle */}
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <Archive className="w-4 h-4" />
          Show Archived
        </label>

        {/* Count */}
        <span className="text-sm text-slate-500 ml-auto">
          {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Kanban Board - 4 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {STATUS_ORDER.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            requests={groupedRequests[status]}
            onSelectRequest={handleSelectRequest}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            isDragOver={dragOverStatus === status}
          />
        ))}
      </div>

      {/* Create Request Modal */}
      {showCreateModal && (
        <RequestModal
          inventoryBoats={inventoryBoats}
          onSave={handleCreateRequest}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Request Detail Modal */}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          currentUser={currentUser}
          onClose={handleCloseDetail}
          onAddMessage={handleAddMessage}
          onMarkServiceComplete={handleMarkServiceComplete}
          onConfirmComplete={handleConfirmComplete}
        />
      )}
    </div>
  );
}

export default RequestsView;
