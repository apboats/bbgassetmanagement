// ============================================================================
// SHARED BOAT COMPONENTS
// ============================================================================
// Reusable components for displaying boats consistently across the app
// ============================================================================

import React from 'react';
import { Wrench, Sparkles, Layers, Shield } from 'lucide-react';
import { getActiveSeason } from '../utils/seasonHelpers';

// ============================================================================
// UTILITY: findBoatLocationData
// ============================================================================
// Centralized logic for finding boat location data
// Returns enriched boat object with location and slot information
export function findBoatLocationData(boat, locations = []) {
  let location = boat.location ? locations.find(l => l.name === boat.location) : null;
  let slotId = boat.slot;

  // If boat.location isn't set, search for it in all locations
  if (!location || !slotId) {
    for (const loc of locations) {
      // Check pool_boats array
      if (loc.type === 'pool' && loc.pool_boats?.includes(boat.id)) {
        location = loc;
        slotId = 'pool';
        break;
      }
      // Check boats object (grid slots)
      if (loc.boats) {
        const foundSlot = Object.keys(loc.boats).find(key => loc.boats[key] === boat.id);
        if (foundSlot) {
          location = loc;
          slotId = foundSlot;
          break;
        }
      }
    }
  } else if (location && !slotId) {
    // Location is known but slot isn't - find the slot
    if (location.type === 'pool' && location.pool_boats?.includes(boat.id)) {
      slotId = 'pool';
    } else if (location.boats) {
      slotId = Object.keys(location.boats).find(key => location.boats[key] === boat.id) || null;
    }
  }

  return {
    location,
    slotId,
    enrichedBoat: {
      ...boat,
      location: location?.name || boat.location,
      slot: slotId || boat.slot
    }
  };
}

// ============================================================================
// CUSTOM HOOK: useBoatLocation
// ============================================================================
// Returns formatted location information for a boat
export function useBoatLocation(boat, locations = []) {
  if (!boat.location) {
    return {
      location: null,
      isInPool: false,
      displayLocation: 'Unassigned',
      displaySlot: null,
    };
  }

  const location = locations.find(l => l.name === boat.location);
  const isInPool = location?.type === 'pool' || boat.slot === 'pool';

  // Convert slot to display format
  let displaySlot = boat.slot;
  if (isInPool) {
    displaySlot = 'Pool';
  } else if (boat.slot) {
    // Convert 0-indexed slot to 1-indexed for display (e.g., "0-2" → "1-3")
    const parts = boat.slot.split('-');
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      displaySlot = `${parseInt(parts[0]) + 1}-${parseInt(parts[1]) + 1}`;
    }
  }

  return {
    location,
    isInPool,
    displayLocation: boat.location,
    displaySlot,
  };
}

// ============================================================================
// LOCATION BADGE
// ============================================================================
// Displays location and slot info for a boat
export function LocationBadge({ location, slot, className = '' }) {
  if (!location) {
    return (
      <div className={`text-xs text-slate-500 ${className}`}>
        Unassigned
      </div>
    );
  }

  const isPool = slot === 'Pool' || slot === 'pool';

  return (
    <div className={`text-xs ${className}`}>
      <span className="font-medium text-slate-700">{location}</span>
      {slot && (
        <>
          <span className="text-slate-400 mx-1">•</span>
          <span className={isPool ? 'text-teal-600' : 'text-slate-600'}>{slot}</span>
        </>
      )}
    </div>
  );
}

// ============================================================================
// BOAT STATUS ICONS
// ============================================================================
// Shows completion status icons for customer boats
// For storage boats, shows active season's work phases
export function BoatStatusIcons({ boat, size = 'w-3 h-3', className = '' }) {
  // Only show for customer boats (not inventory)
  if (boat.isInventory) return null;

  // For storage boats, use active season's work phases
  if (boat.storageBoat) {
    const activeSeason = getActiveSeason(boat);
    const mechanicalsComplete = boat[`${activeSeason}MechanicalsComplete`];
    const cleanComplete = boat[`${activeSeason}CleanComplete`];
    const fiberglassComplete = boat[`${activeSeason}FiberglassComplete`];
    const warrantyComplete = boat[`${activeSeason}WarrantyComplete`];

    return (
      <div className={`flex gap-1 ${className}`}>
        <Wrench
          className={`${size} ${mechanicalsComplete ? 'text-green-500' : 'text-slate-300'}`}
          strokeWidth={mechanicalsComplete ? 2.5 : 1.5}
        />
        <Sparkles
          className={`${size} ${cleanComplete ? 'text-green-500' : 'text-slate-300'}`}
          strokeWidth={cleanComplete ? 2.5 : 1.5}
        />
        <Layers
          className={`${size} ${fiberglassComplete ? 'text-green-500' : 'text-slate-300'}`}
          strokeWidth={fiberglassComplete ? 2.5 : 1.5}
        />
        <Shield
          className={`${size} ${warrantyComplete ? 'text-green-500' : 'text-slate-300'}`}
          strokeWidth={warrantyComplete ? 2.5 : 1.5}
        />
      </div>
    );
  }

  // Regular boat - use regular work phases
  return (
    <div className={`flex gap-1 ${className}`}>
      <Wrench
        className={`${size} ${boat.mechanicalsComplete ? 'text-green-500' : 'text-slate-300'}`}
        strokeWidth={boat.mechanicalsComplete ? 2.5 : 1.5}
      />
      <Sparkles
        className={`${size} ${boat.cleanComplete ? 'text-green-500' : 'text-slate-300'}`}
        strokeWidth={boat.cleanComplete ? 2.5 : 1.5}
      />
      <Layers
        className={`${size} ${boat.fiberglassComplete ? 'text-green-500' : 'text-slate-300'}`}
        strokeWidth={boat.fiberglassComplete ? 2.5 : 1.5}
      />
      <Shield
        className={`${size} ${boat.warrantyComplete ? 'text-green-500' : 'text-slate-300'}`}
        strokeWidth={boat.warrantyComplete ? 2.5 : 1.5}
      />
    </div>
  );
}

// ============================================================================
// INVENTORY BADGE
// ============================================================================
// Shows inventory status badge for inventory boats
export function InventoryBadge({ boat, className = '' }) {
  if (!boat.isInventory) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">
        {boat.salesStatus || 'INV'}
      </span>
      <span className="text-xs text-slate-500">Inventory</span>
    </div>
  );
}

// ============================================================================
// BOAT CARD CONTENT
// ============================================================================
// Displays boat information (name, owner, details) without card wrapper
export function BoatCardContent({ boat, showLocation = false, locations = [] }) {
  const { displayLocation, displaySlot } = useBoatLocation(boat, locations);

  if (boat.isInventory) {
    return (
      <>
        <p className="font-semibold text-slate-900 text-sm truncate">{boat.name}</p>
        <p className="text-xs text-slate-600 truncate">{boat.year} {boat.model}</p>
        <InventoryBadge boat={boat} className="mt-2" />
        {showLocation && (
          <LocationBadge
            location={displayLocation}
            slot={displaySlot}
            className="mt-1"
          />
        )}
      </>
    );
  }

  // Customer boat
  return (
    <>
      <p className="font-semibold text-slate-900 text-sm truncate">{boat.owner}</p>
      <p className="text-xs text-slate-600 truncate">{boat.name}</p>
      {boat.workOrderNumber && (
        <p className="text-xs text-slate-500 font-mono mt-1">WO: {boat.workOrderNumber}</p>
      )}
      <BoatStatusIcons boat={boat} className="mt-2" />
      {showLocation && (
        <LocationBadge
          location={displayLocation}
          slot={displaySlot}
          className="mt-1"
        />
      )}
    </>
  );
}

// ============================================================================
// BOAT CARD
// ============================================================================
// Complete boat card with wrapper, click handler, and drag support
export function BoatCard({
  boat,
  onClick,
  showLocation = false,
  locations = [],
  draggable = false,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  className = '',
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={() => onClick && onClick(boat)}
      className={`p-3 bg-white rounded-lg border border-slate-200 hover:border-teal-400 hover:shadow-md cursor-pointer transition-all select-none ${className}`}
      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <BoatCardContent
        boat={boat}
        showLocation={showLocation}
        locations={locations}
      />
    </div>
  );
}

// ============================================================================
// BOAT LIST ITEM
// ============================================================================
// Compact boat display for lists (alternative to cards)
export function BoatListItem({
  boat,
  onClick,
  showLocation = false,
  locations = [],
  className = '',
}) {
  const { displayLocation, displaySlot } = useBoatLocation(boat, locations);

  return (
    <div
      onClick={() => onClick && onClick(boat)}
      className={`p-3 bg-white border-b border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          {boat.isInventory ? (
            <>
              <p className="font-semibold text-slate-900 text-sm truncate">{boat.name}</p>
              <p className="text-xs text-slate-600 truncate">{boat.year} {boat.model}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-900 text-sm truncate">{boat.owner}</p>
              <p className="text-xs text-slate-600 truncate">{boat.name}</p>
            </>
          )}
          {showLocation && (
            <LocationBadge
              location={displayLocation}
              slot={displaySlot}
              className="mt-1"
            />
          )}
        </div>
        <div className="flex items-center gap-2 ml-3">
          {boat.isInventory ? (
            <InventoryBadge boat={boat} />
          ) : (
            <BoatStatusIcons boat={boat} />
          )}
        </div>
      </div>
    </div>
  );
}
