import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Edit2, Trash2, ChevronDown, ChevronRight, Building2, Settings, Grid, Map, Package } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { useRemoveBoat } from '../hooks/useRemoveBoat';
import { useAssignBoat } from '../hooks/useAssignBoat';
import { useBoatDragDrop } from '../hooks/useBoatDragDrop';
import { BoatDetailsModal } from '../components/modals/BoatDetailsModal';
import { InventoryBoatDetailsModal } from '../components/modals/InventoryBoatDetailsModal';
import { BoatAssignmentModal } from '../components/modals/BoatAssignmentModal';
import { EditLocationModal } from '../components/modals/EditLocationModal';
import { SiteManagementModal } from '../components/modals/SiteManagementModal';
import { PoolLocation } from '../components/locations/PoolLocation';
import { LocationGrid, MaximizedLocationModal } from '../components/locations/LocationGrid';
import { LocationSection } from '../components/locations/LocationSection';
import { boatLifecycleService } from '../services/supabaseService';

export function LocationsView({ locations, sites = [], boats, onUpdateLocations, onUpdateBoats, onMoveBoat: onMoveBoatFromContainer, onAddSite, onUpdateSite, onDeleteSite, onReorderSites }) {
  // Get permissions from centralized hook
  const { canManageLocations } = usePermissions();

  // Split boats into regular and inventory
  const regularBoats = boats.filter(b => !b.isInventory);
  const inventoryBoats = boats.filter(b => b.isInventory);

  const [showAddLocation, setShowAddLocation] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [showBoatAssignModal, setShowBoatAssignModal] = useState(false);
  const [showSiteManagement, setShowSiteManagement] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [viewingBoat, setViewingBoat] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [maximizedLocation, setMaximizedLocation] = useState(null);
  const [expandedSites, setExpandedSites] = useState(new Set(sites.map(s => s.id)));
  const mouseYRef = useRef(0);

  // Use unified remove boat hook
  const { removeBoat, isRemoving } = useRemoveBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => setViewingBoat(null)
  });

  // Use unified assign boat hook
  const { assignBoat, isAssigning } = useAssignBoat({
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
    isDragging: isDraggingActive,
    handleDragStart,
    handleDragEnd,
    handleGridDrop,
    handlePoolDrop
  } = useBoatDragDrop({
    onMoveBoat: onMoveBoatFromContainer
  });

  // Keep expandedSites in sync with sites (expand new sites by default)
  useEffect(() => {
    setExpandedSites(prev => {
      const newSet = new Set(prev);
      sites.forEach(site => newSet.add(site.id));
      return newSet;
    });
  }, [sites]);

  // Keep maximizedLocation synchronized with locations prop
  useEffect(() => {
    if (maximizedLocation) {
      const updatedLocation = locations.find(loc => loc.id === maximizedLocation.id);
      if (updatedLocation) {
        setMaximizedLocation(updatedLocation);
      }
    }
  }, [locations, maximizedLocation?.id]);

  // Toggle site expansion
  const toggleSiteExpansion = (siteId) => {
    setExpandedSites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(siteId)) {
        newSet.delete(siteId);
      } else {
        newSet.add(siteId);
      }
      return newSet;
    });
  };

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
    if (!isDraggingActive) return;
    
    console.log('Auto-scroll started - isDraggingActive:', isDraggingActive);
    
    const interval = setInterval(() => {
      const mouseY = mouseYRef.current;
      const windowHeight = window.innerHeight;
      const threshold = 100;
      const speed = 15;
      
      console.log('Checking scroll - mouseY:', mouseY, 'windowHeight:', windowHeight);
      
      if (mouseY < threshold) {
        console.log('Scrolling UP');
        window.scrollBy({ top: -speed, behavior: 'auto' });
      } else if (mouseY > windowHeight - threshold) {
        console.log('Scrolling DOWN');
        window.scrollBy({ top: speed, behavior: 'auto' });
      }
    }, 16); // ~60fps
    
    return () => {
      console.log('Auto-scroll stopped');
      clearInterval(interval);
    };
  }, [isDraggingActive]);

  const handleAddLocation = (newLocation) => {
    const location = {
      ...newLocation,
      boats: {}
    };
    
    // Only add pool_boats for pool type locations
    if (newLocation.type === 'pool') {
      location.pool_boats = [];
    }
    
    // Remove fields that shouldn't be sent to database
    delete location.poolBoats;
    delete location.id; // Let database auto-generate UUID
    
    onUpdateLocations([...locations, location]);
    setShowAddLocation(false);
  };

  const handleUpdateLocation = (updatedLocation) => {
    const updated = locations.map(l => l.id === updatedLocation.id ? updatedLocation : l);
    onUpdateLocations(updated);
    setEditingLocation(null);
  };

  const handleDeleteLocation = (locationId) => {
    if (confirm('Are you sure you want to delete this location?')) {
      // Remove boats from this location
      const location = locations.find(l => l.id === locationId);
      if (location && Object.keys(location.boats).length > 0) {
        const updatedBoats = boats.map(b => {
          if (b.location === location.name) {
            return { ...b, location: null, slot: null };
          }
          return b;
        });
        onUpdateBoats(updatedBoats);
      }
      onUpdateLocations(locations.filter(l => l.id !== locationId));
    }
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

  const handleBoatClick = (boat) => {
    setViewingBoat(boat);
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

      console.log('[LocationsView] Boat saved to database:', savedBoat.id);

      // Reload boats to get the updated list (this updates local state)
      const updatedBoats = [...boats.filter(b => b.id !== savedBoat.id), savedBoat];
      await onUpdateBoats(updatedBoats);

      return savedBoat;
    } catch (error) {
      console.error('[LocationsView] Error importing boat:', error);
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
        console.error('[Assign] Invalid slot coordinates:', selectedSlot);
        alert('Invalid slot selection. Please try again.');
        setIsProcessing(false);
        return;
      }

      slotId = selectedSlot.slotId;
    }

    // Save current scroll position to prevent unwanted scrolling during real-time updates
    const scrollPosition = window.scrollY;

    // Use the unified hook to assign the boat (pass boat object to avoid race condition)
    await assignBoat(boat, selectedLocation.id, slotId, boat.isInventory);

    // Restore scroll position after a brief delay (to allow real-time updates to complete)
    setTimeout(() => {
      window.scrollTo(0, scrollPosition);
    }, 100);
  };

  const handleUpdateBoatFromModal = (updatedBoat) => {
    onUpdateBoats(boats.map(b => b.id === updatedBoat.id ? updatedBoat : b));
    setViewingBoat(updatedBoat);
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

  // Get unassigned boats (include both grid slots and pool boats)
  const assignedBoatIds = new Set();
  locations.forEach(loc => {
    // Grid-based locations
    Object.values(loc.boats || {}).forEach(boatId => assignedBoatIds.add(boatId));
    // Pool-based locations
    (loc.pool_boats || loc.poolBoats || []).forEach(boatId => assignedBoatIds.add(boatId));
  });
  const unassignedBoats = boats.filter(b => b.status !== 'archived' && !assignedBoatIds.has(b.id));

  // Group locations by site, then by type within each site
  const sortedSites = [...sites].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const locationsBySite = sortedSites.map(site => {
    const siteLocations = locations.filter(l => l.site_id === site.id);
    return {
      site,
      racks: siteLocations.filter(l => l.type === 'rack-building'),
      parking: siteLocations.filter(l => l.type === 'parking-lot'),
      workshops: siteLocations.filter(l => l.type === 'shop'),
      pools: siteLocations.filter(l => l.type === 'pool')
    };
  });

  // Unassigned locations (no site_id)
  const unassignedLocations = locations.filter(l => !l.site_id);
  const unassignedRacks = unassignedLocations.filter(l => l.type === 'rack-building');
  const unassignedParking = unassignedLocations.filter(l => l.type === 'parking-lot');
  const unassignedWorkshops = unassignedLocations.filter(l => l.type === 'shop');
  const unassignedPools = unassignedLocations.filter(l => l.type === 'pool');

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-40">
          <div className="bg-white rounded-xl shadow-2xl p-6 flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="font-medium text-slate-900">Updating boat location...</span>
          </div>
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Storage Locations</h2>
          <p className="text-slate-600">Manage boat storage facilities and site organization</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Only show to managers/admins */}
          {canManageLocations && (
            <button
              onClick={() => setShowAddLocation(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md"
            >
              <Plus className="w-5 h-5" />
              Add Location
            </button>
          )}

          {/* Only show to managers/admins */}
          {canManageLocations && (
            <button
              onClick={() => setShowSiteManagement(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-md"
            >
              <Building2 className="w-5 h-5" />
              Manage Sites
            </button>
          )}
        </div>
      </div>

      {/* Instructions Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-1">How to use:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Drag & Drop:</strong> Drag boats from unassigned or between slots to organize</li>
              <li>• <strong>Click Boats:</strong> Click on any boat to view details and remove from location</li>
              <li>• <strong>Click Empty Slots:</strong> Click empty slots to assign a boat</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Locations Grouped by Site */}
      {locationsBySite.map(({ site, racks, parking, workshops, pools }) => {
        const isExpanded = expandedSites.has(site.id);
        const totalLocations = racks.length + parking.length + workshops.length + pools.length;

        if (totalLocations === 0) return null;

        return (
          <div key={site.id} className="space-y-4">
            {/* Site Header */}
            <div
              className="bg-gradient-to-r from-indigo-50 to-indigo-100 border-2 border-indigo-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => toggleSiteExpansion(site.id)}
            >
              <div className="flex items-center gap-3">
                <ChevronDown
                  className={`w-6 h-6 text-indigo-600 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                />
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{site.name}</h3>
                  <p className="text-sm text-slate-600">{totalLocations} location{totalLocations !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {/* Site Locations (collapsible) */}
            {isExpanded && (
              <div className="space-y-6 pl-4 border-l-4 border-indigo-200">
                {racks.length > 0 && (
                  <LocationSection
                    title="Rack Buildings"
                    icon={Grid}
                    color="blue"
                    locations={racks}
                    boats={boats}
                    onSlotClick={handleSlotClick}
                    onBoatClick={(boat) => setViewingBoat(boat)}
                    onEdit={canManageLocations ? setEditingLocation : undefined}
                    onDelete={canManageLocations ? handleDeleteLocation : undefined}
                    onDragStart={handleDragStart}
                    onDrop={handleGridDrop}
                    onDragEnd={handleDragEnd}
                    draggingBoat={draggingBoat}
                    onMaximize={setMaximizedLocation}
                    canManageLocations={canManageLocations}
                  />
                )}

                {parking.length > 0 && (
                  <LocationSection
                    title="Parking Lots"
                    icon={Map}
                    color="purple"
                    locations={parking}
                    boats={boats}
                    onSlotClick={handleSlotClick}
                    onBoatClick={(boat) => setViewingBoat(boat)}
                    onEdit={canManageLocations ? setEditingLocation : undefined}
                    onDelete={canManageLocations ? handleDeleteLocation : undefined}
                    onDragStart={handleDragStart}
                    onDrop={handleGridDrop}
                    onDragEnd={handleDragEnd}
                    draggingBoat={draggingBoat}
                    onMaximize={setMaximizedLocation}
                    canManageLocations={canManageLocations}
                  />
                )}

                {workshops.length > 0 && (
                  <LocationSection
                    title="Service Workshops"
                    icon={Settings}
                    color="orange"
                    locations={workshops}
                    boats={boats}
                    onSlotClick={handleSlotClick}
                    onBoatClick={(boat) => setViewingBoat(boat)}
                    onEdit={canManageLocations ? setEditingLocation : undefined}
                    onDelete={canManageLocations ? handleDeleteLocation : undefined}
                    onDragStart={handleDragStart}
                    onDrop={handleGridDrop}
                    onDragEnd={handleDragEnd}
                    draggingBoat={draggingBoat}
                    onMaximize={setMaximizedLocation}
                    canManageLocations={canManageLocations}
                  />
                )}

                {pools.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                        <Package className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900">Pools</h3>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {pools.map(pool => (
                        <PoolLocation
                          key={pool.id}
                          location={pool}
                          boats={boats}
                          onEdit={canManageLocations ? () => setEditingLocation(pool) : undefined}
                          onDelete={canManageLocations ? () => handleDeleteLocation(pool.id) : undefined}
                          onDragStart={handleDragStart}
                          onDrop={handlePoolDrop}
                          onDragEnd={handleDragEnd}
                          isDragging={!!draggingBoat}
                          onBoatClick={(boat) => {
                            setViewingBoat(boat);
                          }}
                          onAddBoat={() => {
                            setSelectedLocation(pool);
                            setSelectedSlot('pool');
                            setShowBoatAssignModal(true);
                          }}
                          canManageLocations={canManageLocations}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned Locations (no site) */}
      {unassignedLocations.length > 0 && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 border-2 border-slate-300 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-400 to-slate-500 rounded-lg flex items-center justify-center">
                <Map className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Unassigned Locations</h3>
                <p className="text-sm text-slate-600">{unassignedLocations.length} location{unassignedLocations.length !== 1 ? 's' : ''} without a site</p>
              </div>
            </div>
          </div>

          <div className="space-y-6 pl-4 border-l-4 border-slate-300">
            {unassignedRacks.length > 0 && (
              <LocationSection
                title="Rack Buildings"
                icon={Grid}
                color="blue"
                locations={unassignedRacks}
                boats={boats}
                onSlotClick={handleSlotClick}
                onBoatClick={(boat) => setViewingBoat(boat)}
                onEdit={canManageLocations ? setEditingLocation : undefined}
                onDelete={canManageLocations ? handleDeleteLocation : undefined}
                onDragStart={handleDragStart}
                onDrop={handleGridDrop}
                onDragEnd={handleDragEnd}
                draggingBoat={draggingBoat}
                onMaximize={setMaximizedLocation}
                canManageLocations={canManageLocations}
              />
            )}

            {unassignedParking.length > 0 && (
              <LocationSection
                title="Parking Lots"
                icon={Map}
                color="purple"
                locations={unassignedParking}
                boats={boats}
                onSlotClick={handleSlotClick}
                onBoatClick={(boat) => setViewingBoat(boat)}
                onEdit={canManageLocations ? setEditingLocation : undefined}
                onDelete={canManageLocations ? handleDeleteLocation : undefined}
                onDragStart={handleDragStart}
                onDrop={handleGridDrop}
                onDragEnd={handleDragEnd}
                draggingBoat={draggingBoat}
                onMaximize={setMaximizedLocation}
                canManageLocations={canManageLocations}
              />
            )}

            {unassignedWorkshops.length > 0 && (
              <LocationSection
                title="Service Workshops"
                icon={Settings}
                color="orange"
                locations={unassignedWorkshops}
                boats={boats}
                onSlotClick={handleSlotClick}
                onBoatClick={(boat) => setViewingBoat(boat)}
                onEdit={canManageLocations ? setEditingLocation : undefined}
                onDelete={canManageLocations ? handleDeleteLocation : undefined}
                onDragStart={handleDragStart}
                onDrop={handleGridDrop}
                onDragEnd={handleDragEnd}
                draggingBoat={draggingBoat}
                onMaximize={setMaximizedLocation}
                canManageLocations={canManageLocations}
              />
            )}

            {unassignedPools.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Pools</h3>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {unassignedPools.map(pool => (
                    <PoolLocation
                      key={pool.id}
                      location={pool}
                      boats={boats}
                      onEdit={canManageLocations ? () => setEditingLocation(pool) : undefined}
                      onDelete={canManageLocations ? () => handleDeleteLocation(pool.id) : undefined}
                      onDragStart={handleDragStart}
                      onDrop={handlePoolDrop}
                      onDragEnd={handleDragEnd}
                      isDragging={!!draggingBoat}
                      onBoatClick={(boat) => {
                        setViewingBoat(boat);
                      }}
                      onAddBoat={() => {
                        setSelectedLocation(pool);
                        setSelectedSlot('pool');
                        setShowBoatAssignModal(true);
                      }}
                      canManageLocations={canManageLocations}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {locations.length === 0 && (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Map className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">No storage locations yet</p>
          <button
            onClick={() => setShowAddLocation(true)}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
          >
            Create First Location
          </button>
        </div>
      )}

      {/* Modals */}
      {showAddLocation && (
        <EditLocationModal
          location={null}
          sites={sites}
          onSave={handleAddLocation}
          onCancel={() => setShowAddLocation(false)}
        />
      )}
      {editingLocation && (
        <EditLocationModal
          location={editingLocation}
          sites={sites}
          onSave={handleUpdateLocation}
          onCancel={() => setEditingLocation(null)}
        />
      )}
      {showBoatAssignModal && (
        <BoatAssignmentModal
          boats={unassignedBoats}
          allBoats={boats}
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
      {viewingBoat && viewingBoat.isInventory && (
        <InventoryBoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          boats={boats}
          inventoryBoats={inventoryBoats}
          onMoveBoat={handleMoveBoat}
          onUpdateBoat={handleUpdateBoatFromModal}
          onClose={() => setViewingBoat(null)}
        />
      )}
      {viewingBoat && !viewingBoat.isInventory && (
        <BoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          boats={boats}
          inventoryBoats={inventoryBoats}
          onRemove={() => removeBoat(viewingBoat)}
          onUpdateBoat={handleUpdateBoatFromModal}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}

      {/* Maximized Location Modal */}
      {maximizedLocation && (
        <MaximizedLocationModal
          location={maximizedLocation}
          boats={regularBoats}
          inventoryBoats={inventoryBoats}
          onSlotClick={handleSlotClick}
          onBoatClick={handleBoatClick}
          onDragStart={handleDragStart}
          onDrop={handleGridDrop}
          onDragEnd={handleDragEnd}
          draggingBoat={draggingBoat}
          onClose={() => setMaximizedLocation(null)}
        />
      )}

      {/* Site Management Modal */}
      {showSiteManagement && (
        <SiteManagementModal
          sites={sites}
          locations={locations}
          onAddSite={onAddSite}
          onUpdateSite={onUpdateSite}
          onDeleteSite={onDeleteSite}
          onReorderSites={onReorderSites}
          onClose={() => setShowSiteManagement(false)}
        />
      )}
    </div>
  );
}



export default LocationsView;
