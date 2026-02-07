// ============================================================================
// BOAT DETAILS MODAL
// ============================================================================
// Modal for viewing and managing customer boat details
// Includes work phases, status updates, location management, and work orders
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Package, X, Trash2, ChevronLeft, History, Send, MessageSquare } from 'lucide-react';
import { WorkOrdersModal } from './WorkOrdersModal';
import { SlotGridDisplay } from '../locations/SlotGridDisplay';
import supabaseService, { boatLifecycleService, boatNotesService } from '../../services/supabaseService';
import { supabase } from '../../supabaseClient';
import { usePermissions } from '../../hooks/usePermissions';
import { SEASONS, SEASON_LABELS, getActiveSeason } from '../../utils/seasonHelpers';

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

// Status Button Component
function StatusButton({ status, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-all ${
        active
          ? `status-${status} border-transparent text-white font-semibold shadow-md`
          : 'border-slate-300 bg-white hover:border-slate-400 text-slate-700'
      }`}
    >
      {label}
    </button>
  );
}

export function BoatDetailsModal({ boat, onRemove, onClose, onUpdateBoat, onUpdateLocations, locations = [], sites = [], onMoveBoat, boats = [], inventoryBoats = [] }) {
  // Get permissions from centralized hook - ensures consistent access across the app
  const { currentUser } = usePermissions();

  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedMoveLocation, setSelectedMoveLocation] = useState(null);
  const [selectedMoveSlot, setSelectedMoveSlot] = useState(null);
  const [slotViewMode, setSlotViewMode] = useState('layout');
  const [showWorkOrders, setShowWorkOrders] = useState(false);
  const [workOrders, setWorkOrders] = useState([]);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState('');
  const [updatingFromDockmaster, setUpdatingFromDockmaster] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [movementHistory, setMovementHistory] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [sendingNote, setSendingNote] = useState(false);
  const notesEndRef = useRef(null);
  const [activeSeason, setActiveSeason] = useState(
    boat.storageBoat ? getActiveSeason(boat) : 'fall'
  );

  // Handler for seasonal work phases
  const handleSeasonWorkPhaseToggle = (season, phase) => {
    if (isArchived) return;
    const phaseKey = `${season}${phase.charAt(0).toUpperCase() + phase.slice(1)}Complete`;
    const updatedBoat = { ...boat, [phaseKey]: !boat[phaseKey] };

    // Auto-clear "all-work-complete" if unchecking a phase
    const statusKey = `${season}Status`;
    if (!updatedBoat[phaseKey] && boat[statusKey] === 'all-work-complete') {
      updatedBoat[statusKey] = 'on-deck';
    }

    onUpdateBoat(updatedBoat);
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
        const notesData = await boatNotesService.getForBoat(boat.id);
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
  const handleSendNote = async () => {
    if (!newNote.trim() || sendingNote || isArchived) return;

    setSendingNote(true);
    try {
      const addedNote = await boatNotesService.addToBoat(boat.id, currentUser?.id, newNote.trim());
      setNotes(prev => [...prev, addedNote]);
      setNewNote('');
    } catch (err) {
      console.error('Error sending note:', err);
      alert('Failed to send note. Please try again.');
    } finally {
      setSendingNote(false);
    }
  };

  const handleNoteKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendNote();
    }
  };

  const statusLabels = {
    'needs-approval': 'Needs Approval',
    'needs-parts': 'Needs Parts',
    'parts-kit-pulled': 'Parts Kit Pulled',
    'on-deck': 'On Deck',
    'all-work-complete': 'All Work Complete',
    'archived': 'Released'
  };

  // Sales Status labels for inventory boats
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

  // For storage boats, check season-specific work phases; for regular boats, check regular phases
  const allWorkPhasesComplete = boat.storageBoat
    ? (boat[`${activeSeason}MechanicalsComplete`] &&
       boat[`${activeSeason}CleanComplete`] &&
       boat[`${activeSeason}FiberglassComplete`] &&
       boat[`${activeSeason}WarrantyComplete`] &&
       boat[`${activeSeason}InvoicedComplete`])
    : (boat.mechanicalsComplete && boat.cleanComplete && boat.fiberglassComplete && boat.warrantyComplete && boat.invoicedComplete);
  const isArchived = boat.status === 'archived';
  const isInventory = boat.isInventory === true; // Check if this is an inventory boat

  const handleWorkPhaseToggle = (phase) => {
    if (isArchived) return; // Can't modify archived boats

    const updatedBoat = { ...boat, [phase]: !boat[phase] };

    // If unchecking a phase and status is complete, change status
    if (!updatedBoat[phase] && boat.status === 'all-work-complete') {
      updatedBoat.status = 'on-deck';
    }

    onUpdateBoat(updatedBoat);
  };

  const handleStatusUpdate = (newStatus) => {
    if (isArchived) return; // Can't modify archived boats

    // For storage boats, update the active season's status
    if (boat.storageBoat) {
      // Validate: can't set to complete without all phases done for this season
      if (newStatus === 'all-work-complete' && !allWorkPhasesComplete) {
        alert('Cannot mark as complete! All work phases (Mechanicals, Clean, Fiberglass, Warranty, Invoiced) must be completed first.');
        return;
      }

      // Check for unbilled opcodes (labor finished but not closed) when marking complete
      if (newStatus === 'all-work-complete' && workOrders.length > 0) {
        const hasUnbilledOpcodes = workOrders.some(wo =>
          wo.operations && wo.operations.some(op =>
            op.status !== 'C' && op.flagLaborFinished
          )
        );

        if (hasUnbilledOpcodes) {
          const shouldOverride = confirm('All work should be invoiced before the boat is marked as complete. Would you like to override?');
          if (!shouldOverride) {
            return;
          }
        }
      }

      // Update season-specific status
      const statusKey = `${activeSeason}Status`;
      const updatedBoat = { ...boat, [statusKey]: newStatus };

      // Record who marked the season as complete and when
      if (newStatus === 'all-work-complete' && currentUser) {
        updatedBoat[`${activeSeason}CompletedBy`] = currentUser.name || currentUser.username;
        updatedBoat[`${activeSeason}CompletedAt`] = new Date().toISOString();
      } else if (newStatus !== 'all-work-complete') {
        // Clear completedBy if status is changed away from complete
        updatedBoat[`${activeSeason}CompletedBy`] = null;
        updatedBoat[`${activeSeason}CompletedAt`] = null;
      }

      onUpdateBoat(updatedBoat);
    } else {
      // Regular boats - use existing logic
      // Validate: can't set to complete without all phases done
      if (newStatus === 'all-work-complete' && !allWorkPhasesComplete) {
        alert('Cannot mark as complete! All work phases (Mechanicals, Clean, Fiberglass, Warranty, Invoiced) must be completed first.');
        return;
      }

      // Check for unbilled opcodes (labor finished but not closed) when marking complete
      if (newStatus === 'all-work-complete' && workOrders.length > 0) {
        const hasUnbilledOpcodes = workOrders.some(wo =>
          wo.operations && wo.operations.some(op =>
            op.status !== 'C' && op.flagLaborFinished
          )
        );

        if (hasUnbilledOpcodes) {
          const shouldOverride = confirm('All work should be invoiced before the boat is marked as complete. Would you like to override?');
          if (!shouldOverride) {
            return;
          }
        }
      }

      const updatedBoat = { ...boat, status: newStatus };

      // Record who marked the boat as complete and when
      if (newStatus === 'all-work-complete' && currentUser) {
        updatedBoat.completedBy = currentUser.name || currentUser.username;
        updatedBoat.completedAt = new Date().toISOString();
      } else if (newStatus !== 'all-work-complete') {
        // Clear completedBy if status is changed away from complete
        updatedBoat.completedBy = null;
        updatedBoat.completedAt = null;
      }

      onUpdateBoat(updatedBoat);
    }
  };

  const [workOrdersLastSynced, setWorkOrdersLastSynced] = useState(null);
  const [workOrdersFromCache, setWorkOrdersFromCache] = useState(false);

  // Load work orders from database (fast, uses cron-synced data)
  const loadWorkOrdersFromDB = async () => {
    if (!boat.id) {
      setWorkOrdersError('No boat ID available');
      return;
    }

    setLoadingWorkOrders(true);
    setWorkOrdersError('');

    try {
      // Query work orders directly from database
      // Filter: matching boat_id AND no rigging_id (rigging_id means internal work order)
      const { data: workOrdersData, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          operations:work_order_operations(*)
        `)
        .eq('boat_id', boat.id)
        .eq('status', 'O')  // Only open work orders
        .is('rigging_id', null)  // Exclude internal work orders
        .or('is_estimate.is.null,is_estimate.eq.false')  // Exclude estimates
        .order('id', { ascending: true });

      if (error) throw error;

      setWorkOrders(workOrdersData || []);
      setWorkOrdersLastSynced(workOrdersData?.[0]?.last_synced || null);
      setWorkOrdersFromCache(true);
      setShowWorkOrders(true);

      // Auto-populate work order numbers
      if (workOrdersData && workOrdersData.length > 0) {
        const allWorkOrderNumbers = workOrdersData
          .map(wo => wo.id)
          .filter(Boolean)
          .join(', ');

        if (allWorkOrderNumbers && allWorkOrderNumbers !== boat.workOrderNumber) {
          onUpdateBoat({ ...boat, workOrderNumber: allWorkOrderNumbers });
        }
      }
    } catch (error) {
      console.error('Error loading work orders from DB:', error);
      setWorkOrdersError(error.message);
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  // Sync fresh data from Dockmaster API (for "Sync Now" button)
  const syncWorkOrdersFromAPI = async () => {
    if (!boat.customerId && !boat.id) {
      setWorkOrdersError('No customer ID associated with this boat. Work orders cannot be fetched.');
      return;
    }

    setLoadingWorkOrders(true);
    setWorkOrdersError('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

      // Extract only the primitive values we need to avoid circular references
      const requestBody = {
        customerId: String(boat.customerId || ''),
        boatId: String(boat.dockmasterId || ''),
        boatUuid: String(boat.id || ''),
        refresh: true,  // Always refresh when syncing from API
      };

      const response = await fetch(`${supabaseUrl}/functions/v1/dockmaster-workorders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch work orders');
      }

      const data = await response.json();
      setWorkOrders(data.workOrders || []);
      setWorkOrdersLastSynced(data.lastSynced);
      setWorkOrdersFromCache(false);  // Fresh from API

      // Auto-populate ALL work order numbers (comma-separated)
      if (data.workOrders && data.workOrders.length > 0) {
        const allWorkOrderNumbers = data.workOrders
          .map(wo => wo.id)
          .filter(Boolean)
          .join(', ');

        if (allWorkOrderNumbers) {
          onUpdateBoat({ ...boat, workOrderNumber: allWorkOrderNumbers });
        }
      }
    } catch (error) {
      console.error('Error syncing work orders from API:', error);
      setWorkOrdersError(error.message);
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  const updateFromDockmaster = async () => {
    if (!boat.dockmasterId) {
      setUpdateError('This boat has no Dockmaster ID. It may have been created manually.');
      return;
    }

    setUpdatingFromDockmaster(true);
    setUpdateError('');
    setUpdateSuccess('');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

      // Call the retrieve endpoint to get fresh data
      const response = await fetch(`${supabaseUrl}/functions/v1/dockmaster-retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          boatId: boat.dockmasterId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch boat data from Dockmaster');
      }

      const boatData = await response.json();
      console.log('Updated boat data from Dockmaster:', boatData);

      // Update the boat with fresh data from Dockmaster
      const updatedBoat = {
        ...boat,
        name: boatData.name || boat.name,
        model: boatData.model || boat.model,
        make: boatData.make || boat.make,
        year: boatData.year || boat.year,
        hullId: boatData.hin || boat.hullId,
        customerId: boatData.ownerId || boat.customerId, // This is the key field we need!
      };

      onUpdateBoat(updatedBoat);
      setUpdateSuccess('Boat updated successfully from Dockmaster!');

      // Clear success message after 3 seconds
      setTimeout(() => setUpdateSuccess(''), 3000);
    } catch (error) {
      console.error('Error updating from Dockmaster:', error);
      setUpdateError(error.message);
    } finally {
      setUpdatingFromDockmaster(false);
    }
  };

  const handleReleaseBoat = async () => {
    if (confirm(`Release ${boat.name} back to owner? This will remove it from its current location and archive it. This action cannot be undone.`)) {
      try {
        setIsProcessing(true);

        // Remove from location first (if assigned)
        if (boat.location || boat.currentLocation) {
          if (onRemove) {
            try {
              await onRemove();
            } catch (removeError) {
              console.error('Error removing boat from location:', removeError);
              // Continue with archival even if removal fails
            }
          }
        }

        // Use centralized service to archive the boat
        const archivedBoat = await boatLifecycleService.archiveBoat(boat.id);

        // Update parent component
        await onUpdateBoat(archivedBoat);
        onClose();
      } catch (error) {
        console.error('Error releasing boat:', error);
        alert(`Failed to release boat: ${error.message}`);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Get the appropriate status for header color
  const headerStatus = boat.storageBoat
    ? boat[`${getActiveSeason(boat)}Status`]
    : boat.status;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col animate-slide-in">
        {/* Fixed Header */}
        <div className={`status-${headerStatus} p-4 md:p-6 rounded-t-xl flex-shrink-0`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg md:text-xl font-bold text-white mb-0.5 truncate">{boat.name}</h3>
                <p className="text-xs md:text-sm text-white/90 truncate">{boat.model} • {boat.qrCode}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 md:p-6 space-y-4 md:space-y-5 overflow-y-auto flex-1">
          <div>
            <h4 className="text-base md:text-lg font-bold text-slate-900 mb-3">Boat Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-0.5">Owner</p>
                <p className="text-sm font-semibold text-slate-900 truncate">{boat.owner}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-0.5">Status</p>
                <p className="text-sm font-semibold text-slate-900 truncate">{statusLabels[boat.status]}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg col-span-1 sm:col-span-2">
                <p className="text-xs text-slate-600 mb-0.5">Work Order Number</p>
                <input
                  type="text"
                  value={boat.workOrderNumber || ''}
                  onChange={(e) => onUpdateBoat({ ...boat, workOrderNumber: e.target.value })}
                  disabled={isArchived}
                  className={`w-full text-sm font-semibold text-slate-900 bg-transparent border-0 border-b-2 ${
                    isArchived ? 'border-slate-200' : 'border-slate-300 focus:border-blue-500'
                  } px-0 py-1 focus:outline-none focus:ring-0`}
                  placeholder={isArchived ? 'N/A' : 'Enter work order number'}
                />
              </div>

              {/* Sales Status - Only shown for inventory boats */}
              {isInventory && boat.salesStatus && (
                <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg col-span-1 sm:col-span-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <svg className="w-3 h-3 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <p className="text-xs text-blue-700 font-medium">Sales Status (Inventory)</p>
                  </div>
                  <p className="text-sm font-bold text-blue-900">
                    {boat.salesStatus} - {salesStatusLabels[boat.salesStatus] || boat.salesStatus}
                  </p>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-0.5">Current Location</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {boat.location || 'Unassigned'}
                  </p>
                  {!isArchived && locations.length > 0 && (
                    <button
                      onClick={() => setShowLocationPicker(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                    >
                      {boat.location ? 'Move...' : 'Assign...'}
                    </button>
                  )}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-0.5">Slot</p>
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {boat.slot === 'pool' ? 'Pool' : boat.slot ? (() => {
                    // Convert 0-indexed slot to 1-indexed for display (e.g., "0-2" → "1-3")
                    const parts = boat.slot.split('-');
                    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                      return `${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`;
                    }
                    return boat.slot;
                  })() : 'N/A'}
                </p>
              </div>

              {/* Movement History */}
              <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg col-span-1 sm:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <History className="w-4 h-4 text-blue-600" />
                  <p className="text-xs text-blue-700 font-medium">Recent Moves</p>
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

            </div>
          </div>

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
                  {isArchived ? 'No notes recorded' : 'No notes yet. Start the conversation!'}
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
                        <p className="text-sm whitespace-pre-wrap">{note.message}</p>
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
            {!isArchived && (
              <div className="p-3 border-t border-slate-200 bg-slate-50">
                <div className="flex gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyPress={handleNoteKeyPress}
                    placeholder="Type a note..."
                    rows={1}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                    disabled={sendingNote}
                  />
                  <button
                    onClick={handleSendNote}
                    disabled={!newNote.trim() || sendingNote}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {isArchived && (
              <div className="p-2 bg-slate-50 border-t border-slate-200">
                <p className="text-xs text-slate-500 text-center">Notes are read-only for archived boats</p>
              </div>
            )}
          </div>

          {/* Storage Boat Toggle */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-base md:text-lg font-bold text-slate-900">Storage Boat</h4>
              <button
                onClick={() => {
                  if (isArchived) return;
                  const updatedBoat = { ...boat, storageBoat: !boat.storageBoat };
                  onUpdateBoat(updatedBoat);
                }}
                disabled={isArchived}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  boat.storageBoat ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    boat.storageBoat ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

{boat.storageBoat ? (
            // SEASONAL WORK PHASES - Tabbed interface for storage boats
            <div>
              <h4 className="text-base md:text-lg font-bold text-slate-900 mb-3">Seasonal Work Phases</h4>

              {/* Season Tabs */}
              <div className="flex gap-2 mb-4">
                {SEASONS.map(season => (
                  <button
                    key={season}
                    onClick={() => setActiveSeason(season)}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      activeSeason === season
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {SEASON_LABELS[season]}
                  </button>
                ))}
              </div>

              {/* Work Phase Toggles for Active Season */}
              <div className="space-y-2">
                {['mechanicals', 'clean', 'fiberglass', 'warranty', 'invoiced'].map(phase => {
                  const phaseKey = `${activeSeason}${phase.charAt(0).toUpperCase() + phase.slice(1)}Complete`;
                  const isComplete = boat[phaseKey];

                  return (
                    <button
                      key={phase}
                      onClick={() => handleSeasonWorkPhaseToggle(activeSeason, phase)}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                          isComplete ? 'bg-green-100' : 'bg-slate-200'
                        }`}>
                          {isComplete ? (
                            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <X className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-900 truncate capitalize">
                          {phase === 'mechanicals' ? 'Mechanicals' :
                           phase === 'clean' ? 'Clean' :
                           phase === 'fiberglass' ? 'Fiberglass' :
                           phase === 'warranty' ? 'Warranty' :
                           'Invoiced'}
                        </span>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                        isComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isComplete ? '✓' : '○'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            // REGULAR WORK PHASES - Original single-phase interface for non-storage boats
            <div>
              <h4 className="text-base md:text-lg font-bold text-slate-900 mb-1">Work Phases</h4>
              <p className="text-xs text-slate-500 mb-3">Check phases that are complete or not needed. All phases must be verified and billed before marking status as complete.</p>
              <div className="space-y-2">
                <button
                  onClick={() => handleWorkPhaseToggle('mechanicalsComplete')}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                      boat.mechanicalsComplete ? 'bg-green-100' : 'bg-slate-200'
                    }`}>
                      {boat.mechanicalsComplete ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <X className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-900 truncate">Mechanicals</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    boat.mechanicalsComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {boat.mechanicalsComplete ? '✓' : '○'}
                  </span>
                </button>

                <button
                  onClick={() => handleWorkPhaseToggle('cleanComplete')}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                      boat.cleanComplete ? 'bg-green-100' : 'bg-slate-200'
                    }`}>
                      {boat.cleanComplete ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <X className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-900 truncate">Clean</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    boat.cleanComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {boat.cleanComplete ? '✓' : '○'}
                  </span>
                </button>

                <button
                  onClick={() => handleWorkPhaseToggle('fiberglassComplete')}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                      boat.fiberglassComplete ? 'bg-green-100' : 'bg-slate-200'
                    }`}>
                      {boat.fiberglassComplete ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <X className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-900 truncate">Fiberglass</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    boat.fiberglassComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {boat.fiberglassComplete ? '✓' : '○'}
                  </span>
                </button>

                <button
                  onClick={() => handleWorkPhaseToggle('warrantyComplete')}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                      boat.warrantyComplete ? 'bg-green-100' : 'bg-slate-200'
                    }`}>
                      {boat.warrantyComplete ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <X className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-900 truncate">Warranty</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    boat.warrantyComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {boat.warrantyComplete ? '✓' : '○'}
                  </span>
                </button>

                <button
                  onClick={() => handleWorkPhaseToggle('invoicedComplete')}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                      boat.invoicedComplete ? 'bg-green-100' : 'bg-slate-200'
                    }`}>
                      {boat.invoicedComplete ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <X className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-slate-900 truncate">Invoiced</span>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    boat.invoicedComplete ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {boat.invoicedComplete ? '✓' : '○'}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-lg font-bold text-slate-900 mb-4">
              Update Status {boat.storageBoat && `(${SEASON_LABELS[activeSeason]})`}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatusButton
                status="needs-approval"
                label="Needs Approval"
                active={boat.storageBoat ? boat[`${activeSeason}Status`] === 'needs-approval' : boat.status === 'needs-approval'}
                onClick={() => handleStatusUpdate('needs-approval')}
              />
              <StatusButton
                status="needs-parts"
                label="Needs Parts"
                active={boat.storageBoat ? boat[`${activeSeason}Status`] === 'needs-parts' : boat.status === 'needs-parts'}
                onClick={() => handleStatusUpdate('needs-parts')}
              />
              <StatusButton
                status="parts-kit-pulled"
                label="Parts Pulled"
                active={boat.storageBoat ? boat[`${activeSeason}Status`] === 'parts-kit-pulled' : boat.status === 'parts-kit-pulled'}
                onClick={() => handleStatusUpdate('parts-kit-pulled')}
              />
              <StatusButton
                status="on-deck"
                label="On Deck"
                active={boat.storageBoat ? boat[`${activeSeason}Status`] === 'on-deck' : boat.status === 'on-deck'}
                onClick={() => handleStatusUpdate('on-deck')}
              />
              <button
                onClick={() => handleStatusUpdate('all-work-complete')}
                disabled={!allWorkPhasesComplete}
                className={`p-4 rounded-lg border-2 transition-all ${
                  (boat.storageBoat ? boat[`${activeSeason}Status`] === 'all-work-complete' : boat.status === 'all-work-complete')
                    ? 'status-all-work-complete border-transparent text-white font-semibold shadow-md'
                    : allWorkPhasesComplete
                      ? 'border-slate-300 bg-white hover:border-slate-400 text-slate-700'
                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={!allWorkPhasesComplete ? 'Complete all work phases first' : ''}
              >
                <span>Complete</span>
                {boat.storageBoat ? (
                  boat[`${activeSeason}Status`] === 'all-work-complete' && boat[`${activeSeason}CompletedBy`] && (
                    <span className="block text-xs mt-1 opacity-90">
                      by {boat[`${activeSeason}CompletedBy`]}
                    </span>
                  )
                ) : (
                  boat.status === 'all-work-complete' && boat.completedBy && (
                    <span className="block text-xs mt-1 opacity-90">
                      by {boat.completedBy}
                    </span>
                  )
                )}
              </button>
            </div>
            {!allWorkPhasesComplete && (
              <p className="text-sm text-orange-600 mt-2">
                ⚠️ All work phases must be completed before marking as complete
              </p>
            )}
            {boat.storageBoat ? (
              boat[`${activeSeason}Status`] === 'all-work-complete' && boat[`${activeSeason}CompletedBy`] && boat[`${activeSeason}CompletedAt`] && (
                <p className="text-sm text-green-600 mt-2">
                  Marked complete by {boat[`${activeSeason}CompletedBy`]} on {new Date(boat[`${activeSeason}CompletedAt`]).toLocaleDateString()}
                </p>
              )
            ) : (
              boat.status === 'all-work-complete' && boat.completedBy && boat.completedAt && (
                <p className="text-sm text-green-600 mt-2">
                  Marked complete by {boat.completedBy} on {new Date(boat.completedAt).toLocaleDateString()}
                </p>
              )
            )}
          </div>

          {isArchived ? (
            /* Archived Boat View - Read Only */
            <div className="space-y-4">
              {boat.archivedDate && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Released On</p>
                  <p className="font-semibold text-slate-900">
                    {new Date(boat.archivedDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Active Boat View - Editable */
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-200">
              {/* Update from Dockmaster button - show for boats with dockmasterId */}
              {!boat.isInventory && boat.dockmasterId && (
                <button
                  onClick={updateFromDockmaster}
                  disabled={updatingFromDockmaster}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-purple-400 disabled:to-purple-500 text-white font-semibold rounded-lg transition-all shadow-md"
                >
                  <svg className={`w-5 h-5 ${updatingFromDockmaster ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {updatingFromDockmaster ? 'Updating...' : 'Update from Dockmaster'}
                </button>
              )}
              {updateError && (
                <p className="text-sm text-red-600 text-center">{updateError}</p>
              )}
              {updateSuccess && (
                <p className="text-sm text-green-600 text-center">{updateSuccess}</p>
              )}

              {/* View Work Orders Button - only for customer boats with customerId */}
              {!boat.isInventory && boat.customerId && (
                <button
                  onClick={() => loadWorkOrdersFromDB()}
                  disabled={loadingWorkOrders}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-500 text-white font-semibold rounded-lg transition-all shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {loadingWorkOrders ? 'Loading Work Orders...' : 'View Open Work Orders'}
                </button>
              )}
              {!boat.isInventory && !boat.customerId && boat.dockmasterId && (
                <p className="text-xs text-slate-500 text-center">Click "Update from Dockmaster" to enable Work Orders</p>
              )}
              {workOrdersError && (
                <p className="text-sm text-red-600 text-center">{workOrdersError}</p>
              )}
              <button
                onClick={handleReleaseBoat}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-lg transition-all shadow-md"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Release Boat to Owner
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onRemove}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                  Remove from Location
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col animate-slide-in">
            <div className="p-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-bold text-slate-900">
                  {selectedMoveLocation ? 'Select Slot' : 'Move to Location'}
                </h4>
                <button
                  onClick={() => {
                    setShowLocationPicker(false);
                    setSelectedMoveLocation(null);
                    setSelectedMoveSlot(null);
                  }}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {!selectedMoveLocation ? (
                // Step 1: Select location
                <div className="space-y-3">
                  {/* Remove from location option - shown prominently at top */}
                  {boat.location && (
                    <>
                      <button
                        onClick={async () => {
                          if (onMoveBoat) {
                            await onMoveBoat(boat, null, null);
                            setShowLocationPicker(false);
                            // Refresh movement history after move completes
                            await loadMovementHistory();
                          }
                        }}
                        className="w-full p-4 text-left rounded-lg border-2 border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <X className="w-4 h-4 text-red-600" />
                          <p className="font-bold text-red-900">Remove from Location</p>
                        </div>
                        <p className="text-xs text-red-700">Remove boat from {boat.location} and mark as unassigned</p>
                      </button>
                      <div className="border-t border-slate-200 my-3" />
                    </>
                  )}

                  {/* Group locations by site */}
                  {sites.length > 0 ? (
                    // Sites exist - group by site
                    sites.map(site => {
                      const siteLocations = locations.filter(l => l.site_id === site.id);
                      if (siteLocations.length === 0) return null;

                      return (
                        <div key={site.id} className="space-y-2">
                          {/* Site header */}
                          <div className="flex items-center gap-2 px-1">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">{site.name}</span>
                            <div className="flex-1 border-t border-indigo-200" />
                          </div>

                          {/* Workshop locations in this site */}
                          {siteLocations.filter(l => l.type === 'shop').map(loc => {
                            const totalSlots = loc.layout === 'u-shaped'
                              ? (loc.rows * 2) + loc.columns
                              : loc.rows * loc.columns;
                            const occupiedSlots = Object.keys(loc.boats || {}).length;
                            const availableSlots = totalSlots - occupiedSlots;

                            return (
                              <button
                                key={loc.id}
                                onClick={() => setSelectedMoveLocation(loc)}
                                disabled={availableSlots === 0 && boat.location !== loc.name}
                                className={`w-full p-3 text-left rounded-lg border-2 transition-colors ml-2 touch-manipulation ${
                                  boat.location === loc.name
                                    ? 'border-orange-500 bg-orange-50'
                                    : availableSlots === 0
                                    ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                    : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50 active:bg-orange-100'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                                  <p className="font-semibold text-slate-900">{loc.name}</p>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  workshop • {availableSlots} slots available
                                </p>
                              </button>
                            );
                          })}

                          {/* Pool locations in this site */}
                          {siteLocations.filter(l => l.type === 'pool').map(loc => (
                            <button
                              key={loc.id}
                              onClick={async () => {
                                if (onMoveBoat) {
                                  await onMoveBoat(boat, loc, 'pool');
                                  setShowLocationPicker(false);
                                  // Refresh movement history after move completes
                                  await loadMovementHistory();
                                }
                              }}
                              className={`w-full p-3 text-left rounded-lg border-2 transition-colors ml-2 touch-manipulation ${
                                boat.location === loc.name
                                  ? 'border-teal-500 bg-teal-50'
                                  : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50 active:bg-teal-100'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-teal-500" />
                                <p className="font-semibold text-slate-900">{loc.name}</p>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                Pool • {(loc.pool_boats || loc.poolBoats || []).length} boats
                              </p>
                            </button>
                          ))}

                          {/* Rack and parking locations in this site */}
                          {siteLocations.filter(l => l.type === 'rack-building' || l.type === 'parking-lot').map(loc => {
                            const totalSlots = loc.layout === 'u-shaped'
                              ? (loc.rows * 2) + loc.columns
                              : loc.rows * loc.columns;
                            const occupiedSlots = Object.keys(loc.boats || {}).length;
                            const availableSlots = totalSlots - occupiedSlots;

                            return (
                              <button
                                key={loc.id}
                                onClick={() => setSelectedMoveLocation(loc)}
                                disabled={availableSlots === 0 && boat.location !== loc.name}
                                className={`w-full p-3 text-left rounded-lg border-2 transition-colors ml-2 touch-manipulation ${
                                  boat.location === loc.name
                                    ? 'border-blue-500 bg-blue-50'
                                    : availableSlots === 0
                                    ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 active:bg-blue-100'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${
                                    loc.type === 'rack-building' ? 'bg-blue-500' :
                                    loc.type === 'parking-lot' ? 'bg-purple-500' : 'bg-orange-500'
                                  }`} />
                                  <p className="font-semibold text-slate-900">{loc.name}</p>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  {loc.type.replace('-', ' ')} • {availableSlots} slots available
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  ) : (
                    // No sites - show flat list (legacy behavior)
                    <>
                      {/* Workshop locations */}
                      {locations.filter(l => l.type === 'shop').map(loc => {
                        const totalSlots = loc.layout === 'u-shaped'
                          ? (loc.rows * 2) + loc.columns
                          : loc.rows * loc.columns;
                        const occupiedSlots = Object.keys(loc.boats || {}).length;
                        const availableSlots = totalSlots - occupiedSlots;

                        return (
                          <button
                            key={loc.id}
                            onClick={() => setSelectedMoveLocation(loc)}
                            disabled={availableSlots === 0 && boat.location !== loc.name}
                            className={`w-full p-3 text-left rounded-lg border-2 transition-colors touch-manipulation ${
                              boat.location === loc.name
                                ? 'border-orange-500 bg-orange-50'
                                : availableSlots === 0
                                ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50 active:bg-orange-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-orange-500" />
                              <p className="font-semibold text-slate-900">{loc.name}</p>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              workshop • {availableSlots} slots available
                            </p>
                          </button>
                        );
                      })}

                      {/* Pool locations */}
                      {locations.filter(l => l.type === 'pool').map(loc => (
                        <button
                          key={loc.id}
                          onClick={async () => {
                            if (onMoveBoat) {
                              await onMoveBoat(boat, loc, 'pool');
                              setShowLocationPicker(false);
                              // Refresh movement history after move completes
                              await loadMovementHistory();
                            }
                          }}
                          className={`w-full p-3 text-left rounded-lg border-2 transition-colors touch-manipulation ${
                            boat.location === loc.name
                              ? 'border-teal-500 bg-teal-50'
                              : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50 active:bg-teal-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-teal-500" />
                            <p className="font-semibold text-slate-900">{loc.name}</p>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Pool • {(loc.pool_boats || loc.poolBoats || []).length} boats
                          </p>
                        </button>
                      ))}

                      {/* Rack and parking locations */}
                      {locations.filter(l => l.type === 'rack-building' || l.type === 'parking-lot').map(loc => {
                        const totalSlots = loc.layout === 'u-shaped'
                          ? (loc.rows * 2) + loc.columns
                          : loc.rows * loc.columns;
                        const occupiedSlots = Object.keys(loc.boats || {}).length;
                        const availableSlots = totalSlots - occupiedSlots;

                        return (
                          <button
                            key={loc.id}
                            onClick={() => setSelectedMoveLocation(loc)}
                            disabled={availableSlots === 0 && boat.location !== loc.name}
                            className={`w-full p-3 text-left rounded-lg border-2 transition-colors touch-manipulation ${
                              boat.location === loc.name
                                ? 'border-blue-500 bg-blue-50'
                                : availableSlots === 0
                                ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 active:bg-blue-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${
                                loc.type === 'rack-building' ? 'bg-blue-500' : 'bg-purple-500'
                              }`} />
                              <p className="font-semibold text-slate-900">{loc.name}</p>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {loc.type.replace('-', ' ')} • {availableSlots} slots available
                            </p>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {/* Unassigned locations (no site_id) - only show if sites exist */}
                  {sites.length > 0 && (() => {
                    const unassignedLocs = locations.filter(l => !l.site_id);
                    if (unassignedLocs.length === 0) return null;

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                          <div className="w-2 h-2 rounded-full bg-slate-400" />
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Unassigned</span>
                          <div className="flex-1 border-t border-slate-200" />
                        </div>
                        {unassignedLocs.map(loc => {
                          const isPool = loc.type === 'pool';
                          const totalSlots = loc.layout === 'u-shaped'
                            ? (loc.rows * 2) + loc.columns
                            : loc.rows * loc.columns;
                          const occupiedSlots = Object.keys(loc.boats || {}).length;
                          const availableSlots = totalSlots - occupiedSlots;

                          return (
                            <button
                              key={loc.id}
                              onClick={async () => {
                                if (isPool && onMoveBoat) {
                                  await onMoveBoat(boat, loc, 'pool');
                                  setShowLocationPicker(false);
                                  // Refresh movement history after move completes
                                  await loadMovementHistory();
                                } else {
                                  setSelectedMoveLocation(loc);
                                }
                              }}
                              disabled={!isPool && availableSlots === 0 && boat.location !== loc.name}
                              className={`w-full p-3 text-left rounded-lg border-2 transition-colors ml-2 touch-manipulation ${
                                boat.location === loc.name
                                  ? 'border-blue-500 bg-blue-50'
                                  : (!isPool && availableSlots === 0)
                                  ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                  : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 active:bg-blue-100'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${
                                  isPool ? 'bg-teal-500' :
                                  loc.type === 'rack-building' ? 'bg-blue-500' :
                                  loc.type === 'parking-lot' ? 'bg-purple-500' : 'bg-orange-500'
                                }`} />
                                <p className="font-semibold text-slate-900">{loc.name}</p>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                {isPool ? `Pool • ${(loc.pool_boats || loc.poolBoats || []).length} boats` : `${loc.type.replace('-', ' ')} • ${availableSlots} slots available`}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                // Step 2: Select slot for grid location
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setSelectedMoveLocation(null)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <ChevronLeft className="w-4 h-4" />
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
                      onSlotClick={async (slotId) => {
                        if (onMoveBoat) {
                          await onMoveBoat(boat, selectedMoveLocation, slotId);
                          setShowLocationPicker(false);
                          setSelectedMoveLocation(null);
                          await loadMovementHistory();
                        }
                      }}
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

      {/* Work Orders Modal - Using shared component */}
      {showWorkOrders && (
        <WorkOrdersModal
          workOrders={workOrders}
          boatName={boat.name}
          boatOwner={boat.owner}
          lastSynced={workOrdersLastSynced}
          fromCache={workOrdersFromCache}
          loading={loadingWorkOrders}
          onRefresh={() => syncWorkOrdersFromAPI()}
          onClose={() => setShowWorkOrders(false)}
          variant="customer"
        />
      )}
    </div>
  );
}

export default BoatDetailsModal;
