import React, { useState, useEffect, useRef } from 'react';
import { Edit2, Save, X, ChevronDown, ChevronRight, Plus, Maximize2, Minimize2, Settings, User, Map } from 'lucide-react';
import { useRemoveBoat } from '../hooks/useRemoveBoat';
import { useAssignBoat } from '../hooks/useAssignBoat';
import { useBoatDragDrop } from '../hooks/useBoatDragDrop';
import { BoatDetailsModal } from '../components/modals/BoatDetailsModal';
import { InventoryBoatDetailsModal } from '../components/modals/InventoryBoatDetailsModal';
import { BoatAssignmentModal } from '../components/modals/BoatAssignmentModal';
import { PoolLocation } from '../components/locations/PoolLocation';
import { LocationGrid, MaximizedLocationModal } from '../components/locations/LocationGrid';
import { LocationSection } from '../components/locations/LocationSection';
import { boatLifecycleService } from '../services/supabaseService';

export function MyViewEditor({ locations, sites = [], boats, userPreferences, currentUser, onSavePreferences, onUpdateLocations, onUpdateBoats, onMoveBoat: onMoveBoatFromContainer }) {
  const [selectedLocations, setSelectedLocations] = useState(
    userPreferences.selectedLocations || locations.map(l => l.id)
  );
  const [locationOrder, setLocationOrder] = useState(
    userPreferences.locationOrder || locations.map(l => l.id)
  );
  const [draggedItem, setDraggedItem] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);

  // Boat assignment modal state
  const [showBoatAssignModal, setShowBoatAssignModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [viewingBoat, setViewingBoat] = useState(null);
  const mouseYRef = useRef(0);

  // Use unified remove boat hook
  const { removeBoat } = useRemoveBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => setViewingBoat(null)
  });

  // Use unified assign boat hook
  const { assignBoat } = useAssignBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => {
      setShowBoatAssignModal(false);
      setSelectedLocation(null);
      setSelectedSlot(null);
      setIsProcessing(false);
    }
  });

  // Use unified drag-and-drop hook
  const {
    draggingBoat,
    draggingFrom,
    isDragging,
    handleDragStart: handleBoatDragStart,
    handleDragEnd: handleBoatDragEnd,
    handleGridDrop: handleBoatDrop,
    handlePoolDrop
  } = useBoatDragDrop({
    onMoveBoat: onMoveBoatFromContainer
  });

  // Sync viewingBoat with boats array when it updates (real-time changes)
  useEffect(() => {
    if (viewingBoat) {
      const updatedBoat = boats.find(b => b.id === viewingBoat.id);
      if (updatedBoat && JSON.stringify(updatedBoat) !== JSON.stringify(viewingBoat)) {
        // Preserve the enriched properties (currentLocation, currentSlot)
        setViewingBoat({
          ...updatedBoat,
          currentLocation: viewingBoat.currentLocation,
          currentSlot: viewingBoat.currentSlot
        });
      }
    }
  }, [boats]);

  // Track mouse position continuously
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseYRef.current = e.clientY;
    };
    
    const handleTouchMove = (e) => {
      if (e.touches?.[0]) {
        mouseYRef.current = e.touches[0].clientY;
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // Auto-scroll when dragging
  useEffect(() => {
    if (!isDragging) return;
    
    console.log('MyView auto-scroll started - isDragging:', isDragging);
    
    const interval = setInterval(() => {
      const mouseY = mouseYRef.current;
      const windowHeight = window.innerHeight;
      const threshold = 100;
      const speed = 15;
      
      console.log('MyView checking scroll - mouseY:', mouseY, 'windowHeight:', windowHeight);
      
      if (mouseY < threshold) {
        console.log('MyView scrolling UP');
        window.scrollBy({ top: -speed, behavior: 'auto' });
      } else if (mouseY > windowHeight - threshold) {
        console.log('MyView scrolling DOWN');
        window.scrollBy({ top: speed, behavior: 'auto' });
      }
    }, 16); // ~60fps
    
    return () => {
      console.log('MyView auto-scroll stopped');
      clearInterval(interval);
    };
  }, [isDragging]);

  // Update state when locations or preferences change
  useEffect(() => {
    if (userPreferences.selectedLocations) {
      setSelectedLocations(userPreferences.selectedLocations);
    } else if (locations.length > 0) {
      setSelectedLocations(locations.map(l => l.id));
    }
    
    if (userPreferences.locationOrder && userPreferences.locationOrder.length > 0) {
      // Make sure all current location IDs are in the order
      const existingIds = new Set(userPreferences.locationOrder);
      const allIds = [...userPreferences.locationOrder];
      
      // Add any new locations that aren't in the saved order
      locations.forEach(loc => {
        if (!existingIds.has(loc.id)) {
          allIds.push(loc.id);
        }
      });
      
      setLocationOrder(allIds);
    } else if (locations.length > 0) {
      setLocationOrder(locations.map(l => l.id));
    }
  }, [locations, userPreferences]);

  const handleToggleLocation = (locationId) => {
    const newSelected = selectedLocations.includes(locationId)
      ? selectedLocations.filter(id => id !== locationId)
      : [...selectedLocations, locationId];
    
    setSelectedLocations(newSelected);
    setHasChanges(true);
  };

  const handleDragStart = (e, locationId) => {
    setDraggedItem(locationId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropLocationId) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === dropLocationId) return;

    const newOrder = [...locationOrder];
    const draggedIndex = newOrder.indexOf(draggedItem);
    const dropIndex = newOrder.indexOf(dropLocationId);

    // Remove dragged item
    newOrder.splice(draggedIndex, 1);
    // Insert at drop position
    newOrder.splice(dropIndex, 0, draggedItem);

    setLocationOrder(newOrder);
    setDraggedItem(null);
    setHasChanges(true);
  };

  const handleSave = () => {
    onSavePreferences({
      selectedLocations,
      locationOrder
    });
    setHasChanges(false);
    setShowCustomizer(false); // Close customizer after saving
  };

  const handleReset = () => {
    const defaultSelected = locations.map(l => l.id);
    const defaultOrder = locations.map(l => l.id);
    setSelectedLocations(defaultSelected);
    setLocationOrder(defaultOrder);
    setHasChanges(true);
  };

  const handleSlotClick = (location, row, col) => {
    const slotId = `${row}-${col}`;
    const boatId = location.boats ? location.boats[slotId] : null;

    if (boatId) {
      // Occupied slot - show boat details
      const boat = boats.find(b => b.id === boatId);
      if (boat) {
        setViewingBoat({ ...boat, currentLocation: location, currentSlot: slotId });
      }
    } else {
      // Empty slot - open assignment modal
      setSelectedLocation(location);
      setSelectedSlot({ row, col, slotId });
      setShowBoatAssignModal(true);
    }
  };

  // Create a new boat from the assignment modal and return it for immediate assignment
  const handleCreateBoatFromAssignModal = async (newBoatData) => {
    const newBoat = {
      ...newBoatData,
      id: `boat-${Date.now()}`,
      qrCode: `BBG-${Date.now().toString(36).toUpperCase()}`,
      status: newBoatData.status || 'needs-approval',
      mechanicalsComplete: false,
      cleanComplete: false,
      fiberglassComplete: false,
      warrantyComplete: false
    };
    
    const updatedBoats = [...boats, newBoat];
    await onUpdateBoats(updatedBoats);
    
    return newBoat;
  };

  // Import a boat from Dockmaster and return it for immediate assignment
  const handleImportBoatFromAssignModal = async (importedBoatData) => {
    try {
      // Prepare boat data for database insertion
      const boatDataForDb = {
        ...importedBoatData,
        qr_code: importedBoatData.qrCode || `BBG-${Date.now().toString(36).toUpperCase()}`,
        status: importedBoatData.status || 'needs-approval',
        mechanicals_complete: false,
        clean_complete: false,
        fiberglass_complete: false,
        warranty_complete: false
      };

      // Save to database using lifecycle service (this returns the boat with real UUID)
      const savedBoat = await boatLifecycleService.importOrUpdateBoat(boatDataForDb, {
        targetStatus: 'needs-approval',
        preserveLocation: false
      });

      console.log('[MyViewEditor] Boat saved to database:', savedBoat.id);

      // Reload boats to get the updated list (this updates local state)
      const updatedBoats = [...boats.filter(b => b.id !== savedBoat.id), savedBoat];
      await onUpdateBoats(updatedBoats);

      return savedBoat;
    } catch (error) {
      console.error('[MyViewEditor] Error importing boat:', error);
      throw error;
    }
  };

  const handleAssignBoat = async (boatOrId) => {
    if (!selectedLocation || isProcessing) return;

    setIsProcessing(true);

    // Handle both boat object and boat ID
    const boat = typeof boatOrId === 'object' ? boatOrId : boats.find(b => b.id === boatOrId);
    if (!boat) {
      console.error('[Assign] Boat not found:', boatOrId);
      setIsProcessing(false);
      return;
    }

    // Determine slot ID based on location type
    let slotId = null;
    if (selectedLocation.type === 'pool') {
      slotId = 'pool';
    } else {
      if (!selectedSlot) {
        console.error('[Assign] No slot selected for grid assignment');
        setIsProcessing(false);
        return;
      }

      // Validate slot coordinates
      if (typeof selectedSlot.row !== 'number' || typeof selectedSlot.col !== 'number') {
        console.error('[MyView Assign] Invalid slot coordinates:', selectedSlot);
        alert('Invalid slot selection. Please try again.');
        setIsProcessing(false);
        return;
      }

      slotId = selectedSlot.slotId;
    }

    // Use the unified hook to assign the boat (pass boat object to avoid race condition)
    await assignBoat(boat, selectedLocation.id, slotId, boat.isInventory);
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
    setIsProcessing(true);
    
    // For inventory boats, use AppContainer's handleMoveBoat directly
    if (boat.isInventory && onMoveBoatFromContainer) {
      try {
        await onMoveBoatFromContainer(boat.id, targetLocation?.id || null, targetSlot || null, true);
        
        // Update viewing boat state
        if (targetLocation) {
          setViewingBoat({
            ...boat,
            location: targetLocation.name,
            slot: targetSlot,
            currentLocation: targetLocation,
            currentSlot: targetSlot
          });
        } else {
          setViewingBoat(null);
        }
      } catch (error) {
        console.error('Error moving inventory boat:', error);
        alert('Failed to move boat. Please try again.');
      }
      setIsProcessing(false);
      return;
    }
    
    // For regular boats, use the existing logic
    let updatedLocations = [...locations];
    
    // Remove from current location
    if (boat.location) {
      const currentLoc = locations.find(l => l.name === boat.location);
      if (currentLoc) {
        if (currentLoc.type === 'pool') {
          const poolBoats = currentLoc.pool_boats || currentLoc.poolBoats || [];
          const updatedLoc = {
            ...currentLoc,
            pool_boats: poolBoats.filter(id => id !== boat.id),
          };
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        } else {
          const updatedLoc = { ...currentLoc, boats: { ...currentLoc.boats } };
          const slotKey = Object.keys(updatedLoc.boats).find(k => updatedLoc.boats[k] === boat.id);
          if (slotKey) delete updatedLoc.boats[slotKey];
          updatedLocations = updatedLocations.map(l => l.id === currentLoc.id ? updatedLoc : l);
        }
      }
    }
    
    // Add to new location
    let updatedBoat = { ...boat };
    if (targetLocation) {
      if (targetLocation.type === 'pool') {
        const poolBoats = targetLocation.pool_boats || targetLocation.poolBoats || [];
        const updatedLoc = {
          ...targetLocation,
          pool_boats: [...poolBoats, boat.id],
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = 'pool';
      } else {
        const currentTargetLoc = updatedLocations.find(l => l.id === targetLocation.id);
        const updatedLoc = {
          ...currentTargetLoc,
          boats: { ...currentTargetLoc.boats, [targetSlot]: boat.id }
        };
        updatedLocations = updatedLocations.map(l => l.id === targetLocation.id ? updatedLoc : l);
        const [row, col] = targetSlot.split('-').map(Number);
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = `${row + 1}-${col + 1}`;
      }
    } else {
      updatedBoat.location = null;
      updatedBoat.slot = null;
    }
    
    try {
      await onUpdateLocations(updatedLocations);
      await onUpdateBoats(boats.map(b => b.id === boat.id ? updatedBoat : b));
      
      // Update viewing boat with new location info
      const newLocation = targetLocation ? updatedLocations.find(l => l.id === targetLocation.id) : null;
      setViewingBoat({
        ...updatedBoat,
        currentLocation: newLocation,
        currentSlot: targetSlot
      });
    } catch (error) {
      console.error('Error moving boat:', error);
      alert('Failed to move boat. Please try again.');
    }
    
    setIsProcessing(false);
  };

  // Get unassigned boats (not in any location slot)
  const assignedBoatIds = new Set();
  locations.forEach(loc => {
    Object.values(loc.boats).forEach(boatId => assignedBoatIds.add(boatId));
  });
  const unassignedBoats = boats.filter(b => b.status !== 'archived' && !assignedBoatIds.has(b.id));

  // Build orderedLocations - show ALL locations in the specified order
  const orderedLocations = locationOrder
    .map(id => locations.find(l => l.id === id))
    .filter(Boolean); // Remove any IDs that don't have matching locations
  
  // Add any locations that aren't in the order yet (newly added locations)
  const idsInOrder = new Set(locationOrder);
  const newLocations = locations.filter(loc => !idsInOrder.has(loc.id));
  const allOrderedLocations = [...orderedLocations, ...newLocations];

  // Get only the selected locations for display
  const myViewLocations = allOrderedLocations.filter(loc => selectedLocations.includes(loc.id));

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">My View</h2>
          <p className="text-slate-600">Your personalized location dashboard</p>
        </div>
        <button
          onClick={() => setShowCustomizer(!showCustomizer)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
        >
          <Settings className="w-5 h-5" />
          {showCustomizer ? 'Hide Customizer' : 'Customize View'}
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">Personal Workspace</h3>
            <p className="text-sm text-blue-800">
              Showing {myViewLocations.length} of {locations.length} locations based on your preferences.
              Click "Customize View" to change which locations appear here.
            </p>
          </div>
        </div>
      </div>

      {/* Customization Panel */}
      {showCustomizer && (
        <div className="bg-white rounded-xl shadow-md border-2 border-blue-300 overflow-hidden animate-slide-in">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Customize Your View</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Check locations to show, uncheck to hide • Drag to reorder
                </p>
              </div>
              {hasChanges && (
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-white transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 space-y-2">
            {allOrderedLocations.map((location) => (
              <div
                key={location.id}
                draggable
                onDragStart={(e) => handleDragStart(e, location.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, location.id)}
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-all cursor-move ${
                  draggedItem === location.id
                    ? 'border-blue-400 bg-blue-50 opacity-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                {/* Drag Handle */}
                <div className="flex-shrink-0 text-slate-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                </div>

                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedLocations.includes(location.id)}
                  onChange={() => handleToggleLocation(location.id)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />

                {/* Location Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900">{location.name}</h4>
                  <p className="text-sm text-slate-600 capitalize">
                    {location.type} • {location.rows} × {location.columns}
                    {location.layout === 'u-shaped' && ' (U-shaped)'}
                  </p>
                </div>

                {/* Visibility Badge */}
                {selectedLocations.includes(location.id) ? (
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full flex-shrink-0">
                    Visible
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-medium rounded-full flex-shrink-0">
                    Hidden
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Locations Grid - Show selected locations with boats */}
      {myViewLocations.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-900">My Locations</h3>
            <p className="text-sm text-slate-600">
              Showing {myViewLocations.length} location{myViewLocations.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {myViewLocations.map(location => {
            // Handle pool-type locations
            if (location.type === 'pool') {
              const poolBoats = (location.pool_boats || [])
                .map(id => boats.find(b => b.id === id))
                .filter(Boolean);

              return (
                <PoolLocation
                  key={location.id}
                  location={location}
                  boats={poolBoats}
                  onBoatClick={(boat) => {
                    // Enrich boat with location data for pool boats
                    setViewingBoat({ ...boat, currentLocation: location, currentSlot: 'pool' });
                  }}
                  onAddBoat={() => {
                    setSelectedLocation(location);
                    setSelectedSlot('pool');
                    setShowBoatAssignModal(true);
                  }}
                  isDragging={isDragging}
                  onDragStart={(e, boat) => handleBoatDragStart(e, boat, location, 'pool')}
                  onDragEnd={handleBoatDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handlePoolDrop(location.id)}
                />
              );
            }

            // Grid-type locations
            return (
              <LocationGrid
                key={location.id}
                location={location}
                boats={boats.filter(b => !b.isInventory)}
                inventoryBoats={boats.filter(b => b.isInventory)}
                onSlotClick={(loc, row, col) => {
                  const slotId = `${row}-${col}`;
                  setSelectedLocation(location);
                  setSelectedSlot({ row, col, slotId });
                  setShowBoatAssignModal(true);
                }}
                onBoatClick={(boat) => {
                  // Find which slot in THIS location contains this boat
                  const boatSlot = Object.keys(location.boats || {}).find(slot => location.boats[slot] === boat.id);
                  setViewingBoat({
                    ...boat,
                    currentLocation: location,  // Use the location object we already have
                    currentSlot: boatSlot        // The actual slot ID from location.boats
                  });
                }}
                draggingBoat={draggingBoat}
                onDragStart={(e, boat, loc, slotId) => handleBoatDragStart(e, boat, location, slotId)}
                onDragEnd={handleBoatDragEnd}
                onDrop={(e, loc, row, col) => handleBoatDrop(e, location, row, col)}
                onMaximize={null}
              />
            );
          })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Map className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">No locations in your view</p>
          <p className="text-sm text-slate-400 mb-4">
            Click "Customize View" to select locations to display
          </p>
          <button
            onClick={() => setShowCustomizer(true)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Customize View
          </button>
        </div>
      )}

      {/* Save Reminder */}
      {hasChanges && showCustomizer && (
        <div className="fixed bottom-6 right-6 bg-orange-500 text-white px-6 py-3 rounded-lg shadow-lg animate-slide-in">
          <p className="font-medium">You have unsaved changes</p>
          <p className="text-sm opacity-90">Click "Save Changes" to apply</p>
        </div>
      )}

      {/* Boat Assignment Modal */}
      {showBoatAssignModal && (
        <BoatAssignmentModal
          boats={unassignedBoats}
          allBoats={boats.filter(b => b.status !== 'archived')}
          locations={locations}
          onAssign={handleAssignBoat}
          onCreateBoat={handleCreateBoatFromAssignModal}
          onImportBoat={handleImportBoatFromAssignModal}
          onCancel={() => {
            setShowBoatAssignModal(false);
            setSelectedLocation(null);
            setSelectedSlot(null);
          }}
        />
      )}

      {/* Boat Details Modal - use appropriate modal based on boat type */}
      {viewingBoat && viewingBoat.isInventory && (
        <InventoryBoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          onMoveBoat={handleMoveBoat}
          onUpdateBoat={(updatedBoat) => {
            const updatedBoats = boats.map(b => b.id === updatedBoat.id ? updatedBoat : b);
            onUpdateBoats(updatedBoats);
            setViewingBoat(updatedBoat);
          }}
          onClose={() => setViewingBoat(null)}
        />
      )}
      {viewingBoat && !viewingBoat.isInventory && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          boats={boats}
          inventoryBoats={[]}
          onRemove={() => removeBoat(viewingBoat)}
          onUpdateBoat={(updatedBoat) => {
            const updatedBoats = boats.map(b => b.id === updatedBoat.id ? updatedBoat : b);
            onUpdateBoats(updatedBoats);
            setViewingBoat(updatedBoat);
          }}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}

/**
 * INVENTORY VIEW COMPONENT
 * ========================
 * 
 * Displays boats synced from Dockmaster API's "Other Inventory" endpoint
 * These are read-only boats that appear/disappear based on their Status in Dockmaster
 * 
 * KEY DIFFERENCES FROM CUSTOMER BOATS:
 * - Source: Dockmaster API (not manually added)
 * - Sync: Auto-syncs every 30 minutes
 * - Status-driven: Only visible when Dockmaster Status field indicates "in service"
 * - Read-only: Cannot manually add/edit/delete (managed by Dockmaster)
 * 
 * DATABASE MIGRATION NOTES:
 * - Create separate table from customer boats
 * - Track dockmaster_id for sync reconciliation
 * - Include last_synced_at timestamp
 * - Mark as active/inactive based on Status field rather than deleting
 */

export default MyViewEditor;
