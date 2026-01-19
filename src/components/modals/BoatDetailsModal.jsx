// ============================================================================
// BOAT DETAILS MODAL
// ============================================================================
// Modal for viewing and managing customer boat details
// Includes work phases, status updates, location management, and work orders
// ============================================================================

import React, { useState, useEffect } from 'react';
import { Package, X, Trash2, ChevronLeft, History } from 'lucide-react';
import { WorkOrdersModal } from './WorkOrdersModal';
import supabaseService, { boatLifecycleService } from '../../services/supabaseService';

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

export function BoatDetailsModal({ boat, onRemove, onClose, onUpdateBoat, onUpdateLocations, locations = [], sites = [], onMoveBoat, currentUser }) {
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedMoveLocation, setSelectedMoveLocation] = useState(null);
  const [selectedMoveSlot, setSelectedMoveSlot] = useState(null);
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

  // Load movement history when modal opens
  useEffect(() => {
    if (boat?.id) {
      setLoadingMovements(true);
      supabaseService.boatMovements.getForBoat(boat.id, 5)
        .then(movements => setMovementHistory(movements))
        .catch(err => console.error('Error loading movement history:', err))
        .finally(() => setLoadingMovements(false));
    }
  }, [boat?.id]);

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

  const allWorkPhasesComplete = boat.mechanicalsComplete && boat.cleanComplete && boat.fiberglassComplete && boat.warrantyComplete && boat.invoicedComplete;
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
  };

  const [workOrdersLastSynced, setWorkOrdersLastSynced] = useState(null);
  const [workOrdersFromCache, setWorkOrdersFromCache] = useState(false);

  const fetchWorkOrders = async (refresh = false) => {
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
        refresh: Boolean(refresh),
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
      setWorkOrdersFromCache(data.fromCache || false);
      setShowWorkOrders(true);
    } catch (error) {
      console.error('Error fetching work orders:', error);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 md:p-4 z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col animate-slide-in">
        {/* Fixed Header */}
        <div className={`status-${boat.status} p-4 md:p-6 rounded-t-xl flex-shrink-0`}>
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

          {/* Notes Section */}
          <div>
            <h4 className="text-base md:text-lg font-bold text-slate-900 mb-3">Notes</h4>
            <textarea
              value={boat.notes || ''}
              onChange={(e) => onUpdateBoat({ ...boat, notes: e.target.value })}
              disabled={isArchived}
              placeholder={isArchived ? 'No notes' : 'Add notes about this boat...'}
              rows={4}
              className={`w-full px-3 py-2 border rounded-lg text-sm resize-y ${
                isArchived
                  ? 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed'
                  : 'bg-white border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-slate-900'
              }`}
            />
            <p className="text-xs text-slate-500 mt-1">
              {isArchived ? 'Notes are read-only for archived boats' : 'Notes are automatically saved as you type'}
            </p>
          </div>

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

          <div>
            <h4 className="text-lg font-bold text-slate-900 mb-4">Update Status</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatusButton
                status="needs-approval"
                label="Needs Approval"
                active={boat.status === 'needs-approval'}
                onClick={() => handleStatusUpdate('needs-approval')}
              />
              <StatusButton
                status="needs-parts"
                label="Needs Parts"
                active={boat.status === 'needs-parts'}
                onClick={() => handleStatusUpdate('needs-parts')}
              />
              <StatusButton
                status="parts-kit-pulled"
                label="Parts Pulled"
                active={boat.status === 'parts-kit-pulled'}
                onClick={() => handleStatusUpdate('parts-kit-pulled')}
              />
              <StatusButton
                status="on-deck"
                label="On Deck"
                active={boat.status === 'on-deck'}
                onClick={() => handleStatusUpdate('on-deck')}
              />
              <button
                onClick={() => handleStatusUpdate('all-work-complete')}
                disabled={!allWorkPhasesComplete}
                className={`p-4 rounded-lg border-2 transition-all ${
                  boat.status === 'all-work-complete'
                    ? 'status-all-work-complete border-transparent text-white font-semibold shadow-md'
                    : allWorkPhasesComplete
                      ? 'border-slate-300 bg-white hover:border-slate-400 text-slate-700'
                      : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={!allWorkPhasesComplete ? 'Complete all work phases first' : ''}
              >
                <span>Complete</span>
                {boat.status === 'all-work-complete' && boat.completedBy && (
                  <span className="block text-xs mt-1 opacity-90">
                    by {boat.completedBy}
                  </span>
                )}
              </button>
            </div>
            {!allWorkPhasesComplete && (
              <p className="text-sm text-orange-600 mt-2">
                ⚠️ All work phases must be completed before marking as complete
              </p>
            )}
            {boat.status === 'all-work-complete' && boat.completedBy && boat.completedAt && (
              <p className="text-sm text-green-600 mt-2">
                Marked complete by {boat.completedBy} on {new Date(boat.completedAt).toLocaleDateString()}
              </p>
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
                  onClick={() => fetchWorkOrders()}
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
                                className={`w-full p-3 text-left rounded-lg border-2 transition-colors ml-2 ${
                                  boat.location === loc.name
                                    ? 'border-orange-500 bg-orange-50'
                                    : availableSlots === 0
                                    ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                    : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
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
                                }
                              }}
                              className={`w-full p-3 text-left rounded-lg border-2 transition-colors ml-2 ${
                                boat.location === loc.name
                                  ? 'border-teal-500 bg-teal-50'
                                  : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
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
                                className={`w-full p-3 text-left rounded-lg border-2 transition-colors ml-2 ${
                                  boat.location === loc.name
                                    ? 'border-blue-500 bg-blue-50'
                                    : availableSlots === 0
                                    ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
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
                            className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                              boat.location === loc.name
                                ? 'border-orange-500 bg-orange-50'
                                : availableSlots === 0
                                ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
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
                            }
                          }}
                          className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                            boat.location === loc.name
                              ? 'border-teal-500 bg-teal-50'
                              : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
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
                            className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                              boat.location === loc.name
                                ? 'border-blue-500 bg-blue-50'
                                : availableSlots === 0
                                ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
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
                                } else {
                                  setSelectedMoveLocation(loc);
                                }
                              }}
                              disabled={!isPool && availableSlots === 0 && boat.location !== loc.name}
                              className={`w-full p-3 text-left rounded-lg border-2 transition-colors ml-2 ${
                                boat.location === loc.name
                                  ? 'border-blue-500 bg-blue-50'
                                  : (!isPool && availableSlots === 0)
                                  ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed'
                                  : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
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
                  <button
                    onClick={() => setSelectedMoveLocation(null)}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-3"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back to locations
                  </button>
                  <p className="text-sm text-slate-600 mb-3">
                    Select a slot in <strong>{selectedMoveLocation.name}</strong>:
                  </p>
                  <div
                    className="grid gap-1.5 max-h-[300px] overflow-y-auto"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(selectedMoveLocation.columns, 6)}, minmax(50px, 1fr))`
                    }}
                  >
                    {Array.from({ length: selectedMoveLocation.rows }).map((_, row) =>
                      Array.from({ length: selectedMoveLocation.columns }).map((_, col) => {
                        const slotId = `${row}-${col}`;
                        const isOccupied = selectedMoveLocation.boats?.[slotId];
                        const isCurrentBoat = isOccupied === boat.id;
                        const displaySlot = `${row + 1}-${col + 1}`;

                        // For U-shaped layouts, render empty div for interior slots
                        if (selectedMoveLocation.layout === 'u-shaped') {
                          const isLeftEdge = col === 0;
                          const isRightEdge = col === selectedMoveLocation.columns - 1;
                          const isBottomRow = row === selectedMoveLocation.rows - 1;
                          if (!isLeftEdge && !isRightEdge && !isBottomRow) {
                            // Render empty placeholder to maintain grid structure
                            return <div key={slotId} className="aspect-square" />;
                          }
                        }

                        return (
                          <button
                            key={slotId}
                            onClick={async () => {
                              if (!isOccupied && onMoveBoat) {
                                await onMoveBoat(boat, selectedMoveLocation, slotId);
                                setShowLocationPicker(false);
                                setSelectedMoveLocation(null);
                              }
                            }}
                            disabled={isOccupied && !isCurrentBoat}
                            className={`p-2 text-xs font-medium rounded transition-colors ${
                              isCurrentBoat
                                ? 'bg-blue-500 text-white'
                                : isOccupied
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-blue-100 text-slate-700'
                            }`}
                          >
                            {displaySlot}
                          </button>
                        );
                      })
                    )}
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
          onRefresh={() => fetchWorkOrders(true)}
          onClose={() => setShowWorkOrders(false)}
          variant="customer"
        />
      )}
    </div>
  );
}

export default BoatDetailsModal;
