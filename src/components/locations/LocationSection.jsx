// ============================================================================
// LOCATION SECTION COMPONENT
// ============================================================================
// Wrapper component that groups locations by type with an icon header
// Used in LocationsView for organizing rack buildings, parking lots, workshops
// ============================================================================

import React from 'react';
import { LocationGrid } from './LocationGrid';

export function LocationSection({
  title,
  icon: Icon,
  color,
  locations,
  boats,
  inventoryBoats,
  onSlotClick,
  onBoatClick,
  draggingBoat,
  onDragStart,
  onDragEnd,
  onDrop,
  onMaximize,
  onEdit,
  onDelete,
  canManageLocations
}) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600'
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 bg-gradient-to-br ${colors[color]} rounded-lg flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900">{title}</h3>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {locations.map(location => (
          <LocationGrid
            key={location.id}
            location={location}
            boats={boats}
            inventoryBoats={inventoryBoats}
            onSlotClick={onSlotClick}
            onBoatClick={onBoatClick}
            draggingBoat={draggingBoat}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDrop={onDrop}
            onMaximize={() => onMaximize(location)}
            onEdit={onEdit ? () => onEdit(location) : undefined}
            onDelete={onDelete ? () => onDelete(location.id) : undefined}
            canManageLocations={canManageLocations}
          />
        ))}
      </div>
    </div>
  );
}
