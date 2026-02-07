import React, { useState, useEffect } from 'react';
import { Package, Map, Grid, ChevronRight } from 'lucide-react';
import { useRemoveBoat } from '../hooks/useRemoveBoat';
import { BoatDetailsModal } from '../components/modals/BoatDetailsModal';
import { InventoryBoatDetailsModal } from '../components/modals/InventoryBoatDetailsModal';
import { SummaryCard, StatusCard, CustomerBoatCard } from '../components/SharedComponents';

export function DashboardView({ boats, locations, sites = [], users = [], onNavigate, onUpdateBoats, onUpdateLocations, onMoveBoat: onMoveBoatFromContainer }) {
  const [viewingBoat, setViewingBoat] = useState(null);

  // Use unified remove boat hook
  const { removeBoat } = useRemoveBoat({
    onMoveBoat: onMoveBoatFromContainer,
    onSuccess: () => setViewingBoat(null)
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

  const statusCounts = {
    needsApproval: boats.filter(b => b.status === 'needs-approval').length,
    needsParts: boats.filter(b => b.status === 'needs-parts').length,
    partsKitPulled: boats.filter(b => b.status === 'parts-kit-pulled').length,
    onDeck: boats.filter(b => b.status === 'on-deck').length,
    allWorkComplete: boats.filter(b => b.status === 'all-work-complete').length,
  };

  const totalBoats = boats.filter(b => b.status !== 'archived').length;
  const totalLocations = locations.length;
  
  // Calculate total capacity and occupancy
  const totalCapacity = locations.reduce((sum, loc) => {
    if (loc.type === 'pool') return sum; // Pools don't have fixed capacity
    const isUShape = loc.layout === 'u-shaped';
    return sum + (isUShape ? (loc.rows * 2) + loc.columns : loc.rows * loc.columns);
  }, 0);
  
  const totalOccupiedSlots = locations.reduce((acc, loc) => {
    if (loc.type === 'pool') {
      return acc + (loc.pool_boats || loc.poolBoats || []).length;
    }
    return acc + Object.keys(loc.boats || {}).length;
  }, 0);
  const occupancyRate = totalCapacity > 0 ? Math.round((totalOccupiedSlots / totalCapacity) * 100) : 0;

  const handleViewBoat = (boat) => {
    // Find the location if boat is assigned
    const location = boat.location ? locations.find(l => l.name === boat.location) : null;
    const slotId = location ? Object.keys(location.boats || {}).find(key => location.boats[key] === boat.id) : null;
    
    setViewingBoat({
      ...boat,
      currentLocation: location,
      currentSlot: slotId || (location?.type === 'pool' ? 'pool' : null)
    });
  };

  const handleUpdateBoatFromModal = (updatedBoat) => {
    onUpdateBoats(boats.map(b => b.id === updatedBoat.id ? updatedBoat : b));
    setViewingBoat(updatedBoat);
  };

  const handleMoveBoat = async (boat, targetLocation, targetSlot) => {
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
        updatedBoat.location = targetLocation.name;
        updatedBoat.slot = targetSlot;  // Use 0-indexed slot directly (matches database)
      }
    } else {
      updatedBoat.location = null;
      updatedBoat.slot = null;
    }
    
    await onUpdateLocations(updatedLocations);
    onUpdateBoats(boats.map(b => b.id === boat.id ? updatedBoat : b));
    
    // Update viewing boat with new location info
    const newLocation = targetLocation ? updatedLocations.find(l => l.id === targetLocation.id) : null;
    setViewingBoat({
      ...updatedBoat,
      currentLocation: newLocation,
      currentSlot: targetSlot
    });
  };

  return (
    <div className="space-y-8 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h2>
        <p className="text-slate-600">Overview of your boat management system</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard 
          title="Total Boats" 
          value={totalBoats} 
          icon={Package} 
          color="blue"
          onClick={() => onNavigate('boats')}
        />
        <SummaryCard 
          title="Storage Locations" 
          value={totalLocations} 
          icon={Map} 
          color="purple"
          onClick={() => onNavigate('locations')}
        />
        <SummaryCard 
          title="Occupancy Rate" 
          value={`${occupancyRate}%`}
          subtitle={`${totalOccupiedSlots} / ${totalCapacity} slots`}
          icon={Grid} 
          color="orange"
          onClick={() => onNavigate('locations')}
        />
        <SummaryCard 
          title="Work Complete" 
          value={statusCounts.allWorkComplete} 
          icon={Package} 
          color="green"
        />
      </div>

      {/* Status Overview */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Boat Status Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatusCard status="needs-approval" count={statusCounts.needsApproval} label="Needs Approval" />
          <StatusCard status="needs-parts" count={statusCounts.needsParts} label="Needs Parts" />
          <StatusCard status="parts-kit-pulled" count={statusCounts.partsKitPulled} label="Parts Kit Pulled" />
          <StatusCard status="on-deck" count={statusCounts.onDeck} label="On Deck" />
          <StatusCard status="all-work-complete" count={statusCounts.allWorkComplete} label="All Work Complete" />
        </div>
      </div>

      {/* Recent Boats */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">Recent Boats</h3>
          <button
            onClick={() => onNavigate('boats')}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
          >
            View All
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boats.slice(0, 6).map(boat => (
            <div key={boat.id} onClick={() => handleViewBoat(boat)} className="cursor-pointer hover:scale-[1.02] transition-transform">
              <CustomerBoatCard boat={boat} onEdit={() => {}} onDelete={() => {}} compact={true} />
            </div>
          ))}
        </div>
      </div>

      {/* Boat Details Modal - use appropriate modal based on boat type */}
      {viewingBoat && viewingBoat.isInventory && (
        <InventoryBoatDetailsModal
          boat={viewingBoat}
          locations={locations}
          sites={sites}
          boats={boats.filter(b => !b.isInventory)}
          inventoryBoats={boats.filter(b => b.isInventory)}
          users={users}
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
          boats={boats.filter(b => !b.isInventory)}
          inventoryBoats={boats.filter(b => b.isInventory)}
          users={users}
          onRemove={() => removeBoat(viewingBoat)}
          onUpdateBoat={handleUpdateBoatFromModal}
          onMoveBoat={handleMoveBoat}
          onClose={() => setViewingBoat(null)}
        />
      )}
    </div>
  );
}

export default DashboardView;
