// ============================================================================
// INVENTORY BOAT DETAILS MODAL
// ============================================================================
// Modal for inventory boats with workflow tracking by type (NEW, USED, BROKERAGE)
// Includes work phases, status updates, location management, and work orders
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Wrench, History, FileText, DollarSign, CheckCircle, AlertTriangle, MessageSquare } from 'lucide-react';
import { MentionInput, renderMessageWithMentions } from '../MentionInput';

// Work type configuration by inventory type
// All types use 'prep' and 'rigging' as database keys, only the labels differ
const WORK_TYPES = {
  USED: ['prep', 'rigging'],
  NEW: ['prep', 'rigging'],       // Uses 'prep' column, displays as "PRE-RIG"
  BROKERAGE: ['prep', 'rigging']  // Uses 'prep' column, displays as "PRE-RIG"
};

// Labels depend on inventory type - USED shows "PREP", others show "PRE-RIG"
const getWorkTypeLabel = (workType, inventoryType) => {
  if (workType === 'prep') {
    return inventoryType === 'USED' ? 'PREP' : 'PRE-RIG';
  }
  return 'RIGGING';
};

// Work phases (same for all types and tabs)
const WORK_PHASES = ['mechanicals', 'clean', 'fiberglass', 'warranty', 'invoiced', 'photographed'];

// Status labels (same as customer boats)
const STATUS_LABELS = {
  'needs-approval': 'Needs Approval',
  'needs-parts': 'Needs Parts',
  'parts-kit-pulled': 'Parts Kit Pulled',
  'on-deck': 'On Deck',
  'all-work-complete': 'All Work Complete'
};

// Get inventory type from raw_data (NEW, USED, BROKERAGE)
const getInventoryType = (boat) => {
  const rawData = boat.rawData || boat.raw_data || {};
  return rawData.type || 'NEW'; // Default to NEW if not specified
};

// Convert camelCase to snake_case for database
const toSnakeCase = (str) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

// Status Button Component
function StatusButton({ status, label, active, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-3 rounded-lg border-2 transition-all text-sm ${
        active
          ? `status-${status} border-transparent text-white font-semibold shadow-md`
          : disabled
            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'border-slate-300 bg-white hover:border-slate-400 text-slate-700'
      }`}
    >
      {label}
    </button>
  );
}
import supabaseService, { boatNotesService } from '../../services/supabaseService';
import { supabase } from '../../supabaseClient';
import { usePermissions } from '../../hooks/usePermissions';
import { findBoatLocationData, useBoatLocation } from '../BoatComponents';
import { WorkOrdersModal } from './WorkOrdersModal';
import { SlotGridDisplay } from '../locations/SlotGridDisplay';
import { WindowStickerModal } from './WindowStickerModal';
import { EstimateDetailsModal } from './EstimateDetailsModal';
import { estimatesService } from '../../services/supabaseService';

// Compute hash from estimates for change detection
const computeEstimatesHash = (estimates) => {
  if (!estimates || estimates.length === 0) return null;
  const sorted = [...estimates].sort((a, b) => a.id - b.id);
  return sorted.map(e => `${e.id}:${e.total_charges || 0}`).join('|');
};

// Helper to format time ago
function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function InventoryBoatDetailsModal({ boat, locations = [], sites = [], boats = [], inventoryBoats = [], users = [], onMoveBoat, onUpdateBoat, onClose }) {
  // Get permissions from centralized hook - ensures consistent access across the app
  const { canSeeCost, currentUser, isSalesManager, isAdmin } = usePermissions();

  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [slotViewMode, setSlotViewMode] = useState('layout');
  const [selectedMoveLocation, setSelectedMoveLocation] = useState(null);

  // Work order state
  const [showWorkOrders, setShowWorkOrders] = useState(false);
  const [workOrders, setWorkOrders] = useState([]);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState('');
  const [workOrdersLastSynced, setWorkOrdersLastSynced] = useState(null);

  // Movement history state
  const [movementHistory, setMovementHistory] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // Notes state - conversational
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [sendingNote, setSendingNote] = useState(false);
  const notesEndRef = useRef(null);

  // Window sticker state
  const [showWindowSticker, setShowWindowSticker] = useState(false);

  // Cost breakdown modal state
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  // Estimates state
  const [estimates, setEstimates] = useState([]);
  const [loadingEstimates, setLoadingEstimates] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [selectedEstimateIndex, setSelectedEstimateIndex] = useState(0);
  const [approvingEstimates, setApprovingEstimates] = useState(false);

  // Workflow state - determine work types based on inventory type
  const inventoryType = getInventoryType(boat);
  const workTypes = WORK_TYPES[inventoryType] || WORK_TYPES.NEW;

  // Initialize local workflow state from boat prop (for immediate UI updates)
  const initWorkflowState = () => {
    const state = {};
    ['prep', 'rigging'].forEach(workType => {
      // Initialize phases
      WORK_PHASES.forEach(phase => {
        const snakeKey = `${workType}_${phase}_complete`;
        state[snakeKey] = boat[snakeKey] || false;
      });
      // Initialize status
      state[`${workType}_status`] = boat[`${workType}_status`] || 'needs-approval';
      state[`${workType}_completed_by`] = boat[`${workType}_completed_by`] || null;
      state[`${workType}_completed_at`] = boat[`${workType}_completed_at`] || null;
    });
    return state;
  };
  const [workflowState, setWorkflowState] = useState(initWorkflowState);

  // Determine initial active tab - if first tab is complete, show second tab
  const getInitialWorkType = () => {
    const firstTabStatus = workflowState[`${workTypes[0]}_status`];
    if (firstTabStatus === 'all-work-complete') {
      return workTypes[1];
    }
    return workTypes[0];
  };
  const [activeWorkType, setActiveWorkType] = useState(getInitialWorkType);

  // Helper to get phase complete value from local state
  const getPhaseValue = (workType, phase) => {
    const snakeKey = `${workType}_${phase}_complete`;
    return workflowState[snakeKey] || false;
  };

  // Helper to get status value from local state
  const getStatusValue = (workType) => {
    return workflowState[`${workType}_status`] || 'needs-approval';
  };

  // Check if all phases are complete for a work type
  const checkAllPhasesComplete = (workType) => {
    return WORK_PHASES.every(phase => getPhaseValue(workType, phase));
  };

  // Get readiness status based on work type completion
  const getReadinessStatus = () => {
    const tab1Complete = getStatusValue(workTypes[0]) === 'all-work-complete';
    const tab2Complete = getStatusValue(workTypes[1]) === 'all-work-complete';

    if (tab1Complete && tab2Complete) {
      return 'delivery-ready';
    }
    if (tab1Complete) {
      return 'sales-ready';
    }
    return null;
  };

  // Handle work phase toggle
  const handleWorkPhaseToggle = async (phase) => {
    const snakeWorkType = toSnakeCase(activeWorkType);
    const snakeKey = `${snakeWorkType}_${phase}_complete`;
    const currentValue = getPhaseValue(activeWorkType, phase);

    const updates = {
      [snakeKey]: !currentValue
    };

    // Auto-clear status if unchecking a phase and status was complete
    const statusKey = `${snakeWorkType}_status`;
    if (currentValue && getStatusValue(activeWorkType) === 'all-work-complete') {
      updates[statusKey] = 'on-deck';
    }

    // Update local state immediately for responsive UI
    setWorkflowState(prev => ({ ...prev, ...updates }));

    try {
      await supabaseService.inventoryBoats.update(boat.id, updates);
      if (onUpdateBoat) {
        // Pass updated boat back to parent
        const updatedBoat = { ...boat, ...updates };
        onUpdateBoat(updatedBoat);
      }
    } catch (error) {
      console.error('Error updating work phase:', error);
      alert('Failed to update work phase. Please try again.');
    }
  };

  // Handle status update
  const handleStatusUpdate = async (newStatus) => {
    const allPhasesComplete = checkAllPhasesComplete(activeWorkType);

    if (newStatus === 'all-work-complete' && !allPhasesComplete) {
      alert('All work phases must be completed first.');
      return;
    }

    const snakeWorkType = toSnakeCase(activeWorkType);
    const updates = {
      [`${snakeWorkType}_status`]: newStatus
    };

    // Record who marked complete and when
    if (newStatus === 'all-work-complete') {
      updates[`${snakeWorkType}_completed_by`] = currentUser?.name || 'Unknown';
      updates[`${snakeWorkType}_completed_at`] = new Date().toISOString();
    } else {
      // Clear completed info if status changed away from complete
      updates[`${snakeWorkType}_completed_by`] = null;
      updates[`${snakeWorkType}_completed_at`] = null;
    }

    // Update local state immediately for responsive UI
    setWorkflowState(prev => ({ ...prev, ...updates }));

    try {
      await supabaseService.inventoryBoats.update(boat.id, updates);
      if (onUpdateBoat) {
        const updatedBoat = { ...boat, ...updates };
        onUpdateBoat(updatedBoat);
      }

      // Auto-switch to RIGGING tab when first tab completes
      if (newStatus === 'all-work-complete' && activeWorkType === workTypes[0]) {
        setActiveWorkType(workTypes[1]);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  // Extract movement history loading to reusable function
  const loadMovementHistory = useCallback(async () => {
    if (boat?.id) {
      setLoadingMovements(true);
      try {
        const movements = await supabaseService.boatMovements.getForBoat(boat.id, 5);
        setMovementHistory(movements);
      } catch (err) {
        console.error('Error loading movement history:', err);
      } finally {
        setLoadingMovements(false);
      }
    }
  }, [boat?.id]);

  // Load movement history when modal opens
  useEffect(() => {
    loadMovementHistory();
  }, [loadMovementHistory]);

  // Load notes when modal opens
  const loadNotes = useCallback(async () => {
    if (boat?.id) {
      setLoadingNotes(true);
      try {
        const notesData = await boatNotesService.getForInventoryBoat(boat.id);
        setNotes(notesData);
      } catch (err) {
        console.error('Error loading notes:', err);
      } finally {
        setLoadingNotes(false);
      }
    }
  }, [boat?.id]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Scroll to bottom of notes when they change
  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notes]);

  // Handle sending a new note
  const handleSendNote = async (noteText) => {
    // Use passed text (from MentionInput) or fall back to state
    const text = noteText || newNote;
    if (!text.trim() || sendingNote) return;

    setSendingNote(true);
    try {
      const addedNote = await boatNotesService.addToInventoryBoat(boat.id, currentUser?.id, text.trim());
      setNotes(prev => [...prev, addedNote]);
      setNewNote('');
    } catch (err) {
      console.error('Error sending note:', err);
      alert('Failed to send note. Please try again.');
    } finally {
      setSendingNote(false);
    }
  };

  // Load estimates when modal opens
  useEffect(() => {
    const loadEstimates = async () => {
      const dockmasterId = boat.dockmasterId || boat.dockmaster_id;
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
  }, [boat.dockmasterId, boat.dockmaster_id]);

  // Handle estimates approval
  // Stores approval on inventory_boats only (single source of truth)
  const handleApproveEstimates = async () => {
    if (approvingEstimates) return;
    setApprovingEstimates(true);
    try {
      const hash = computeEstimatesHash(estimates);
      const approvalData = {
        estimates_approved_by: currentUser?.id,
        estimates_approved_at: new Date().toISOString(),
        estimates_approval_hash: hash
      };

      // Update only the inventory_boat (single source of truth)
      await supabaseService.inventoryBoats.update(boat.id, approvalData);

      if (onUpdateBoat) {
        onUpdateBoat({
          ...boat,
          ...approvalData
        });
      }
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

  // Enrich boat with location data if missing (centralized logic)
  const { enrichedBoat } = findBoatLocationData(boat, locations);

  // Query database directly (fast, uses cron-synced data)
  const fetchWorkOrders = async () => {
    if (!boat.dockmasterId) {
      setWorkOrdersError('No Dockmaster ID available for this boat');
      return;
    }

    setLoadingWorkOrders(true);
    setWorkOrdersError('');

    try {
      const { data: workOrders, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          operations:work_order_operations(*)
        `)
        .eq('rigging_id', boat.dockmasterId)  // Match rigging_id to inventory boat's dockmaster_id
        .or('is_estimate.is.null,is_estimate.eq.false')  // Exclude estimates
        // No status filter - get ALL work orders (open and closed)
        .order('id', { ascending: false });  // Most recent first

      if (error) throw error;

      setWorkOrders(workOrders || []);
      setWorkOrdersLastSynced(workOrders?.[0]?.last_synced || null);
      setShowWorkOrders(true);
    } catch (error) {
      console.error('Error loading work orders from DB:', error);
      setWorkOrdersError(error.message);
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  // Use the shared hook for consistent location display
  const { displayLocation, displaySlot } = useBoatLocation(enrichedBoat, locations);

  const salesStatusLabels = {
    'HA': 'On Hand Available',
    'HS': 'On Hand Sold',
    'OA': 'On Order Available',
    'OS': 'On Order Sold',
    'FA': 'Future Available',
    'FS': 'Future Sold',
    'S': 'Sold',
    'R': 'Reserved',
    'FP': 'Floor Planned'
  };

  const handleMove = async (targetLocation, targetSlot) => {
    console.log('[InventoryBoatDetailsModal.handleMove] Called with:', { targetLocation: targetLocation?.id, targetSlot });
    if (onMoveBoat) {
      console.log('[InventoryBoatDetailsModal.handleMove] Calling onMoveBoat with boat:', boat.id);
      await onMoveBoat(boat, targetLocation, targetSlot);
      console.log('[InventoryBoatDetailsModal.handleMove] onMoveBoat complete');
      // Refresh movement history after move completes
      await loadMovementHistory();
    } else {
      console.log('[InventoryBoatDetailsModal.handleMove] No onMoveBoat handler!');
    }
    setShowLocationPicker(false);
    setSelectedMoveLocation(null);

    // If removing from location (targetLocation is null), close the modal
    if (!targetLocation) {
      console.log('[InventoryBoatDetailsModal.handleMove] Closing modal after removal');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-blue-500 rounded text-xs font-medium">INVENTORY</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  inventoryType === 'USED' ? 'bg-amber-500' :
                  inventoryType === 'BROKERAGE' ? 'bg-purple-500' : 'bg-emerald-500'
                }`}>{inventoryType}</span>
                {/* Readiness Badge */}
                {getReadinessStatus() === 'delivery-ready' && (
                  <span className="px-2 py-0.5 bg-green-500 rounded text-xs font-medium">DELIVERY READY</span>
                )}
                {getReadinessStatus() === 'sales-ready' && (
                  <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded text-xs font-medium">SALES READY</span>
                )}
              </div>
              <h3 className="text-xl font-bold truncate">{boat.name}</h3>
              <p className="text-blue-100 text-sm truncate">{boat.year} {boat.make} {boat.model}</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-blue-500 rounded transition-colors flex-shrink-0 ml-2">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Sales Status - Prominent */}
          {boat.salesStatus && (
            <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <p className="text-sm text-blue-700 font-medium">Sales Status</p>
              </div>
              <p className="text-lg font-bold text-blue-900">
                {salesStatusLabels[boat.salesStatus] || boat.salesStatus}
              </p>
              <p className="text-xs text-blue-600 mt-1">Code: {boat.salesStatus}</p>
            </div>
          )}

          {/* Work Type Tabs and Phases */}
          <div className="border-2 border-slate-200 rounded-xl overflow-hidden">
            {/* Work Type Tabs */}
            <div className="flex border-b border-slate-200">
              {workTypes.map((workType) => {
                const isActive = activeWorkType === workType;
                const isComplete = getStatusValue(workType) === 'all-work-complete';
                return (
                  <button
                    key={workType}
                    onClick={() => setActiveWorkType(workType)}
                    className={`flex-1 px-4 py-3 font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : isComplete
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {getWorkTypeLabel(workType, inventoryType)}
                      {isComplete && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Work Phases */}
            <div className="p-4 bg-slate-50">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">
                Work Phases ({getWorkTypeLabel(activeWorkType, inventoryType)})
              </h4>
              <div className="space-y-2">
                {WORK_PHASES.map(phase => {
                  const isComplete = getPhaseValue(activeWorkType, phase);
                  return (
                    <button
                      key={phase}
                      onClick={() => handleWorkPhaseToggle(phase)}
                      className="w-full flex items-center justify-between p-3 bg-white hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                          isComplete ? 'bg-green-500' : 'bg-slate-200'
                        }`}>
                          {isComplete && (
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-900 capitalize">{phase}</span>
                      </div>
                      <span className={`text-xs font-medium ${isComplete ? 'text-green-600' : 'text-slate-400'}`}>
                        {isComplete ? 'Complete' : 'Pending'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status Update Section */}
            <div className="p-4 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">
                Update Status ({getWorkTypeLabel(activeWorkType, inventoryType)})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(STATUS_LABELS).map(([status, label]) => {
                  const currentStatus = getStatusValue(activeWorkType);
                  const isActive = currentStatus === status;
                  const allPhasesComplete = checkAllPhasesComplete(activeWorkType);
                  const isDisabled = status === 'all-work-complete' && !allPhasesComplete;

                  return (
                    <StatusButton
                      key={status}
                      status={status}
                      label={label}
                      active={isActive}
                      disabled={isDisabled}
                      onClick={() => handleStatusUpdate(status)}
                    />
                  );
                })}
              </div>
              {!checkAllPhasesComplete(activeWorkType) && (
                <p className="text-xs text-amber-600 mt-2">
                  Complete all work phases to mark as "All Work Complete"
                </p>
              )}
              {/* Completed By Info */}
              {getStatusValue(activeWorkType) === 'all-work-complete' && (() => {
                const snakeWorkType = toSnakeCase(activeWorkType);
                const completedBy = workflowState[`${snakeWorkType}_completed_by`];
                const completedAt = workflowState[`${snakeWorkType}_completed_at`];
                if (completedBy && completedAt) {
                  return (
                    <p className="text-xs text-green-600 mt-2">
                      Marked complete by {completedBy} on {new Date(completedAt).toLocaleDateString()}
                    </p>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Boat Info Grid - Core Identifiers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-0.5">Hull ID</p>
              <p className="text-sm font-semibold text-slate-900 font-mono">{boat.hullId || boat.hull_id || 'N/A'}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-0.5">Stock #</p>
              <p className="text-sm font-semibold text-slate-900 font-mono">{boat.stockNumber || boat.stock_number || 'N/A'}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-0.5">Color</p>
              <p className="text-sm font-semibold text-slate-900">{boat.color || 'N/A'}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-0.5">Dockmaster ID</p>
              <p className="text-sm font-semibold text-slate-900 font-mono">{boat.dockmasterId || boat.dockmaster_id || 'N/A'}</p>
            </div>
          </div>

          {/* Pricing Info - List Price and Web Price */}
          {(() => {
            const rawData = boat.rawData || boat.raw_data || {};
            const listPrice = boat.listPrice || boat.list_price || rawData.listPrice;
            const webPrice = boat.webPrice || boat.web_price || rawData.price1;

            // Check for actual positive values (not just truthy, since 0 would render as "0")
            const hasListPrice = listPrice && Number(listPrice) > 0;
            const hasWebPrice = webPrice && Number(webPrice) > 0;

            if (!hasListPrice && !hasWebPrice) return null;

            return (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <h4 className="text-sm font-medium text-green-800 mb-2">Pricing</h4>
                <div className="grid grid-cols-2 gap-4">
                  {hasListPrice && (
                    <div>
                      <p className="text-xs text-green-600">List Price</p>
                      <p className="text-lg font-bold text-green-900">
                        ${Number(listPrice).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {hasWebPrice && (
                    <div>
                      <p className="text-xs text-green-600">Web Price</p>
                      <p className="text-lg font-bold text-green-900">
                        ${Number(webPrice).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Boat Specs - Compact inline display */}
          {(() => {
            const specs = [
              { label: 'Length', value: boat.length },
              { label: 'Beam', value: boat.beam },
              { label: 'Draft', value: boat.draft },
              { label: 'Weight', value: boat.weight },
              { label: 'Hull', value: boat.hullType || boat.hull_type },
              { label: 'Material', value: boat.hullMaterial || boat.hull_material },
              { label: 'Fuel Cap.', value: boat.fuelCapacity || boat.fuel_capacity },
              { label: 'Max HP', value: boat.motorRating || boat.motor_rating },
            ].filter(s => s.value);

            if (specs.length === 0) return null;

            return (
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {specs.map((spec, idx) => (
                    <span key={idx} className="text-sm">
                      <span className="text-slate-500">{spec.label}:</span>{' '}
                      <span className="font-medium text-slate-900">{spec.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Motors & Trailers - Side by side when both exist */}
          {(boat.motors?.length > 0 || boat.trailers?.length > 0) && (
            <div className={`grid ${boat.motors?.length > 0 && boat.trailers?.length > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              {/* Motors */}
              {boat.motors?.length > 0 && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <h4 className="text-sm font-semibold text-orange-800">
                      {boat.motors.length > 1 ? `${boat.motors.length} Engines` : 'Engine'}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {boat.motors.map((motor, idx) => (
                      <div key={motor.id || idx} className="text-sm">
                        <p className="font-medium text-slate-900">
                          {motor.vendorName} {motor.modelNumber}
                          {motor.horsePower && (
                            <span className="ml-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded">
                              {motor.horsePower} HP
                            </span>
                          )}
                        </p>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {[
                            motor.year && `${motor.year}`,
                            motor.serialNumber && `S/N: ${motor.serialNumber}`,
                            motor.shaftLength && `${motor.shaftLength} shaft`
                          ].filter(Boolean).join(' | ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trailers */}
              {boat.trailers?.length > 0 && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <h4 className="text-sm font-semibold text-purple-800">
                      {boat.trailers.length > 1 ? `${boat.trailers.length} Trailers` : 'Trailer'}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {boat.trailers.map((trailer, idx) => (
                      <div key={trailer.id || idx} className="text-sm">
                        <p className="font-medium text-slate-900">
                          {trailer.vendorName} {trailer.modelNumber}
                        </p>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {[
                            trailer.year && `${trailer.year}`,
                            trailer.serialNumber && `S/N: ${trailer.serialNumber}`,
                            trailer.weightCapacity && `Cap: ${trailer.weightCapacity}`
                          ].filter(Boolean).join(' | ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Options & Accessories - Collapsible tags display */}
          {(boat.options?.length > 0 || boat.accessories?.length > 0) && (
            <div className="p-3 bg-slate-50 rounded-xl space-y-3">
              {/* Options */}
              {boat.options?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Options ({boat.options.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {boat.options.slice(0, 8).map((opt, idx) => (
                      <span key={opt.optionCode || idx} className="px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-700">
                        {opt.desc || opt.optionCode}
                      </span>
                    ))}
                    {boat.options.length > 8 && (
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-medium">
                        +{boat.options.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Accessories */}
              {boat.accessories?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                    Accessories ({boat.accessories.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {boat.accessories.slice(0, 8).map((acc, idx) => (
                      <span key={acc.accCode || idx} className="px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-700">
                        {acc.desc || acc.accCode}
                        {acc.qty > 1 && <span className="text-slate-400 ml-1">x{acc.qty}</span>}
                      </span>
                    ))}
                    {boat.accessories.length > 8 && (
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-medium">
                        +{boat.accessories.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}


          {/* Notes Section - Conversational Thread */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 p-3 bg-slate-50 border-b border-slate-200">
              <MessageSquare className="w-4 h-4 text-slate-600" />
              <h4 className="text-sm font-semibold text-slate-900">Notes</h4>
              <span className="text-xs text-slate-500">({notes.length})</span>
            </div>

            {/* Messages Area */}
            <div className="h-48 overflow-y-auto p-3 space-y-3 bg-white">
              {loadingNotes ? (
                <p className="text-center text-slate-500 py-4 text-sm">Loading notes...</p>
              ) : notes.length === 0 ? (
                <p className="text-center text-slate-400 py-4 text-sm">
                  No notes yet. Start the conversation!
                </p>
              ) : (
                notes.map((note) => {
                  const isCurrentUser = note.user_id === currentUser?.id;
                  return (
                    <div key={note.id} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-2 ${
                          isCurrentUser
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        {!isCurrentUser && (
                          <p className="text-xs font-medium mb-1 opacity-75">
                            {note.user?.name || 'Unknown'}
                          </p>
                        )}
                        <p className="text-sm">
                          {renderMessageWithMentions(note.message, currentUser?.id)}
                        </p>
                        <p className={`text-xs mt-1 ${isCurrentUser ? 'text-blue-200' : 'text-slate-500'}`}>
                          {getTimeAgo(new Date(note.created_at))}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={notesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-3 border-t border-slate-200 bg-slate-50">
              <MentionInput
                value={newNote}
                onChange={setNewNote}
                onSubmit={handleSendNote}
                users={users}
                placeholder="Type a note... Use @ to mention someone"
                disabled={sendingNote}
                submitDisabled={!newNote.trim() || sendingNote}
              />
            </div>
          </div>

          {/* Location Assignment */}
          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-slate-700">Current Location</p>
                <p className="text-lg font-bold text-slate-900">
                  {enrichedBoat.location ? (
                    <>
                      {displayLocation}
                      {displaySlot && (
                        <>
                          <span className="text-slate-400 mx-2">•</span>
                          {displaySlot}
                        </>
                      )}
                    </>
                  ) : (
                    'Unassigned'
                  )}
                </p>
              </div>
              {locations.length > 0 && (
                <button
                  onClick={() => setShowLocationPicker(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {enrichedBoat.location ? 'Move' : 'Assign'}
                </button>
              )}
            </div>
          </div>

          {/* Movement History */}
          <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-4 h-4 text-blue-600" />
              <p className="text-sm text-blue-700 font-medium">Recent Moves</p>
            </div>
            {loadingMovements ? (
              <p className="text-xs text-blue-600">Loading...</p>
            ) : movementHistory.length > 0 ? (
              <div className="space-y-1.5">
                {movementHistory.slice(0, 3).map((move, idx) => {
                  const formatSlot = (slot) => {
                    if (!slot || slot === 'pool') return slot || '';
                    const parts = slot.split('-');
                    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                      return `${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`;
                    }
                    return slot;
                  };
                  const from = move.fromLocation ? `${move.fromLocation}${move.fromSlot ? ` (${formatSlot(move.fromSlot)})` : ''}` : 'Unassigned';
                  const to = move.toLocation ? `${move.toLocation}${move.toSlot ? ` (${formatSlot(move.toSlot)})` : ''}` : 'Unassigned';
                  const date = new Date(move.movedAt);
                  const timeAgo = getTimeAgo(date);

                  const movedByName = move.movedByUser?.name || null;

                  return (
                    <div key={move.id || idx} className="text-xs text-blue-800 flex items-start gap-1">
                      <span className="text-blue-400 flex-shrink-0">{idx === 0 ? '→' : '·'}</span>
                      <span className="truncate">
                        {from} → {to}
                        <span className="text-blue-500 ml-1">
                          ({timeAgo}{movedByName ? ` by ${movedByName}` : ''})
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-blue-600">No movement history yet</p>
            )}
          </div>

          {/* Action Buttons Row 1 - Window Sticker + Show Unit Cost */}
          <div className="grid grid-cols-2 gap-3">
            {/* Window Sticker Button */}
            <button
              onClick={() => setShowWindowSticker(true)}
              className="p-4 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 hover:border-emerald-300 rounded-xl transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-900">Window Sticker</p>
                  <p className="text-xs text-emerald-600">Print-ready format</p>
                </div>
              </div>
            </button>

            {/* Show Unit Cost Button */}
            {canSeeCost ? (
              <button
                onClick={() => setShowCostBreakdown(true)}
                className="p-4 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 hover:border-amber-300 rounded-xl transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-amber-900">Show Unit Cost</p>
                    <p className="text-xs text-amber-600">View cost breakdown</p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl opacity-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-400 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Unit Cost</p>
                    <p className="text-xs text-slate-400">Not available</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons Row 2 - Work Orders + Estimates */}
          <div className="grid grid-cols-2 gap-3">
            {/* Work Orders Button */}
            {boat.dockmasterId ? (
              <button
                onClick={fetchWorkOrders}
                disabled={loadingWorkOrders}
                className="p-4 bg-purple-50 hover:bg-purple-100 border-2 border-purple-200 hover:border-purple-300 rounded-xl transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                    {loadingWorkOrders ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <Wrench className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-purple-900">Work Orders</p>
                    <p className="text-xs text-purple-600">Open & closed history</p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl opacity-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-400 rounded-lg flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Work Orders</p>
                    <p className="text-xs text-slate-400">No Dockmaster ID</p>
                  </div>
                </div>
              </div>
            )}

            {/* Estimates Button */}
            {!loadingEstimates && estimates.length > 0 ? (
              <button
                onClick={() => {
                  setSelectedEstimateIndex(0);
                  setSelectedEstimate(estimates[0]);
                }}
                className="p-4 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 hover:border-amber-300 rounded-xl transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-amber-900">Estimates ({estimates.length})</p>
                    <p className="text-xs text-amber-600">
                      ${estimates.reduce((sum, e) => sum + (e.total_charges || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </button>
            ) : loadingEstimates ? (
              <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-900">Estimates</p>
                    <p className="text-xs text-amber-600">Loading...</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl opacity-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-400 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-500">Estimates</p>
                    <p className="text-xs text-slate-400">None found</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Estimates Approval Status - separate from buttons */}
          {!loadingEstimates && estimates.length > 0 && (() => {
            const currentHash = computeEstimatesHash(estimates);
            const isApproved = boat.estimates_approved_by &&
                               boat.estimates_approval_hash === currentHash;
            const hasChanged = boat.estimates_approved_by &&
                               boat.estimates_approval_hash !== currentHash;

            if (isApproved) {
              return (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-4 h-4" />
                    <span className="font-medium">Estimates Approved</span>
                  </div>
                  <p className="text-sm text-green-700 mt-1">
                    Approved on {new Date(boat.estimates_approved_at).toLocaleString()}
                  </p>
                </div>
              );
            }

            if (hasChanged) {
              return (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
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
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {approvingEstimates ? 'Approving...' : 'Approve Estimates'}
                </button>
              );
            }

            return (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-sm text-slate-600 text-center">
                  Awaiting sales manager approval
                </p>
              </div>
            );
          })()}

          {/* Work Orders Error */}
          {workOrdersError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{workOrdersError}</p>
            </div>
          )}

          {/* Sync Info */}
          <div className="text-xs text-slate-400 text-center">
            <p>Last synced: {boat.lastSynced ? new Date(boat.lastSynced).toLocaleString() : 'Unknown'}</p>
            <p className="mt-1">Data synced from Dockmaster • Read-only</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Work Orders Modal - Using shared component (no refresh capability for inventory) */}
      {showWorkOrders && (
        <WorkOrdersModal
          workOrders={workOrders}
          boatName={boat.name}
          lastSynced={workOrdersLastSynced}
          onClose={() => setShowWorkOrders(false)}
          variant="inventory"
        />
      )}

      {/* Window Sticker Modal */}
      {showWindowSticker && (
        <WindowStickerModal
          boat={boat}
          onClose={() => setShowWindowSticker(false)}
        />
      )}

      {/* Cost Breakdown Modal */}
      {showCostBreakdown && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-600" />
                <h4 className="font-bold text-slate-900">Cost Breakdown</h4>
              </div>
              <button
                onClick={() => setShowCostBreakdown(false)}
                className="p-1 hover:bg-amber-100 rounded"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {(() => {
                // Get cost values from boat object or rawData fallback
                const rawData = boat.rawData || boat.raw_data || {};
                const unitCost = Number(boat.unitCost || boat.unit_cost || rawData.unitCost || 0);
                const optionCost = Number(boat.optionCost || boat.option_cost || rawData.optionCost || 0);
                const prepCost = Number(rawData.prepCost || 0);
                const freightCost = Number(rawData.freightCost || 0);
                const totalCost = Number(boat.totalCost || boat.total_cost || rawData.totalCost || 0);
                const adjustments = totalCost - (unitCost + optionCost + prepCost + freightCost);

                return (
                  <>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-600">Unit Cost</span>
                      <span className="font-semibold text-slate-900">
                        ${unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-600">Option Cost</span>
                      <span className="font-semibold text-slate-900">
                        ${optionCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {prepCost > 0 && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-slate-600">Prep Cost</span>
                        <span className="font-semibold text-slate-900">
                          ${prepCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {freightCost > 0 && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-slate-600">Freight Cost</span>
                        <span className="font-semibold text-slate-900">
                          ${freightCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center py-2 border-t border-slate-200">
                      <span className="text-slate-600">Adjustments & Rebates</span>
                      <span className={`font-semibold ${adjustments < 0 ? 'text-green-600' : adjustments > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {adjustments < 0 ? '-' : adjustments > 0 ? '+' : ''}${Math.abs(adjustments).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3 border-t-2 border-slate-300 bg-slate-50 -mx-4 px-4 mt-2">
                      <span className="font-bold text-slate-900">Total Cost</span>
                      <span className="font-bold text-lg text-slate-900">
                        ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="p-4 border-t border-slate-200">
              <button
                onClick={() => setShowCostBreakdown(false)}
                className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h4 className="font-bold text-slate-900">
                  {selectedMoveLocation ? 'Select Slot' : 'Select Location'}
                </h4>
                <p className="text-xs text-slate-500">
                  {selectedMoveLocation ? `in ${selectedMoveLocation.name}` : 'Choose where to place this boat'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowLocationPicker(false);
                  setSelectedMoveLocation(null);
                }}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {!selectedMoveLocation ? (
                // Step 1: Select location
                <div className="space-y-2">
                  {/* Remove from location option - shown prominently at top */}
                  {enrichedBoat.location && (
                    <>
                      <button
                        onClick={() => handleMove(null, null)}
                        className="w-full p-4 text-left rounded-lg border-2 border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <X className="w-4 h-4 text-red-600" />
                          <p className="font-bold text-red-900">Remove from Location</p>
                        </div>
                        <p className="text-xs text-red-700">Remove boat from {enrichedBoat.location} and mark as unassigned</p>
                      </button>
                      <div className="border-t border-slate-200 my-3" />
                    </>
                  )}

                  {/* Group locations by site */}
                  {sites.length > 0 ? (
                    // Render locations grouped by site
                    sites.map(site => {
                      const siteLocations = locations.filter(l => l.site_id === site.id);
                      if (siteLocations.length === 0) return null;

                      const workshopLocations = siteLocations.filter(l => l.type === 'shop');
                      const poolLocations = siteLocations.filter(l => l.type === 'pool');
                      const rackAndParkingLocations = siteLocations.filter(l => l.type === 'rack-building' || l.type === 'parking-lot');

                      return (
                        <div key={site.id} className="mb-4">
                          {/* Site Header */}
                          <div className="flex items-center gap-2 mb-2 pb-1 border-b border-indigo-200">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            <p className="text-sm font-semibold text-indigo-700">{site.name}</p>
                          </div>

                          <div className="space-y-2 pl-2">
                            {/* Workshop locations in this site */}
                            {workshopLocations.map(loc => (
                              <button
                                key={loc.id}
                                onClick={() => setSelectedMoveLocation(loc)}
                                className="w-full p-3 text-left rounded-lg border-2 border-slate-200 hover:border-orange-300 hover:bg-slate-50 active:bg-orange-100 transition-colors touch-manipulation"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                                  <p className="font-semibold text-slate-900">{loc.name}</p>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  Workshop • {Object.keys(loc.boats || {}).length} boats
                                </p>
                              </button>
                            ))}

                            {/* Pool locations in this site */}
                            {poolLocations.map(loc => (
                              <button
                                key={loc.id}
                                onClick={() => handleMove(loc, 'pool')}
                                className="w-full p-3 text-left rounded-lg border-2 border-slate-200 hover:border-teal-300 hover:bg-slate-50 active:bg-teal-100 transition-colors touch-manipulation"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full bg-teal-500" />
                                  <p className="font-semibold text-slate-900">{loc.name}</p>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">Pool location</p>
                              </button>
                            ))}

                            {/* Rack and parking locations in this site */}
                            {rackAndParkingLocations.map(loc => (
                              <button
                                key={loc.id}
                                onClick={() => setSelectedMoveLocation(loc)}
                                className={`w-full p-3 text-left rounded-lg border-2 border-slate-200 hover:border-blue-300 hover:bg-slate-50 active:bg-blue-100 transition-colors touch-manipulation`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${loc.type === 'rack-building' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                                  <p className="font-semibold text-slate-900">{loc.name}</p>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  {loc.type.replace('-', ' ')} • {Object.keys(loc.boats || {}).length} boats
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Legacy flat list when no sites exist
                    <>
                      {/* Workshop locations */}
                      {locations.filter(l => l.type === 'shop').map(loc => (
                        <button
                          key={loc.id}
                          onClick={() => setSelectedMoveLocation(loc)}
                          className="w-full p-3 text-left rounded-lg border-2 border-slate-200 hover:border-orange-300 hover:bg-slate-50 active:bg-orange-100 transition-colors touch-manipulation"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-orange-500" />
                            <p className="font-semibold text-slate-900">{loc.name}</p>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Workshop • {Object.keys(loc.boats || {}).length} boats
                          </p>
                        </button>
                      ))}

                      {/* Pool locations */}
                      {locations.filter(l => l.type === 'pool').map(loc => (
                        <button
                          key={loc.id}
                          onClick={() => handleMove(loc, 'pool')}
                          className="w-full p-3 text-left rounded-lg border-2 border-slate-200 hover:border-teal-300 hover:bg-slate-50 active:bg-teal-100 transition-colors touch-manipulation"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-teal-500" />
                            <p className="font-semibold text-slate-900">{loc.name}</p>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Pool location</p>
                        </button>
                      ))}

                      {/* Rack and parking locations */}
                      {locations.filter(l => l.type === 'rack-building' || l.type === 'parking-lot').map(loc => (
                        <button
                          key={loc.id}
                          onClick={() => setSelectedMoveLocation(loc)}
                          className="w-full p-3 text-left rounded-lg border-2 border-slate-200 hover:border-blue-300 hover:bg-slate-50 active:bg-blue-100 transition-colors touch-manipulation"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${loc.type === 'rack-building' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                            <p className="font-semibold text-slate-900">{loc.name}</p>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {loc.type.replace('-', ' ')} • {Object.keys(loc.boats || {}).length} boats
                          </p>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                // Step 2: Select slot in grid
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setSelectedMoveLocation(null)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to locations
                    </button>

                    {/* View mode toggle for U-shaped locations */}
                    {selectedMoveLocation.layout === 'u-shaped' && (
                      <button
                        onClick={() => setSlotViewMode(slotViewMode === 'layout' ? 'concise' : 'layout')}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {slotViewMode === 'layout' ? 'Concise View' : 'Layout View'}
                      </button>
                    )}
                  </div>

                  <p className="text-sm text-slate-600 mb-3">
                    Select a slot in <strong>{selectedMoveLocation.name}</strong>:
                  </p>

                  <div className="max-h-[400px] overflow-y-auto">
                    <SlotGridDisplay
                      location={selectedMoveLocation}
                      boats={boats}
                      inventoryBoats={inventoryBoats}
                      mode="select"
                      currentBoatId={boat.id}
                      onSlotClick={(slotId) => handleMove(selectedMoveLocation, slotId)}
                      viewMode={slotViewMode}
                      showBoatNames={true}
                      interactive={true}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

export default InventoryBoatDetailsModal;
