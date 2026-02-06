// ============================================================================
// POOL LOCATION COMPONENT
// ============================================================================
// Reusable component for rendering pool-type locations
// Used in LocationsView and MyViewEditor
// ============================================================================

import React, { useState } from 'react';
import { Search, Package, Trash2, Pencil } from 'lucide-react';
import { BoatCard } from '../BoatComponents';

export function PoolLocation({
  location,
  boats,
  onBoatClick,
  onAddBoat,
  onEdit,
  onDelete,
  onRemove,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  canManageLocations,
  // Touch handlers for touch devices
  onTouchStart,
  onTouchMove,
  onTouchEnd
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Get boats in this pool
  const poolBoatIds = location.pool_boats || location.poolBoats || [];
  const poolBoats = poolBoatIds.map(id => boats.find(b => b.id === id)).filter(Boolean);

  // Filter by search
  const filteredBoats = poolBoats.filter(boat => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return boat.name?.toLowerCase().includes(query) ||
           boat.model?.toLowerCase().includes(query) ||
           boat.make?.toLowerCase().includes(query) ||
           boat.owner?.toLowerCase().includes(query) ||
           boat.hullId?.toLowerCase().includes(query) ||
           boat.dockmasterId?.toLowerCase().includes(query) ||
           boat.workOrderNumber?.toLowerCase().includes(query) ||
           boat.year?.toString().toLowerCase().includes(query) ||
           boat.status?.toLowerCase().includes(query) ||
           boat.salesStatus?.toLowerCase().includes(query);
  });

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (onDragOver) onDragOver(e);
  };

  const handleDropOnPool = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDrop) onDrop(location.id, 'pool');
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden border-2 border-slate-200 hover:border-teal-400 transition-colors">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-teal-500 to-teal-600">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-bold text-white text-lg">{location.name}</h4>
          <div className="flex items-center gap-2">
            {onEdit && canManageLocations && (
              <button
                onClick={onEdit}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                title="Edit location"
              >
                <Pencil className="w-4 h-4 text-white" />
              </button>
            )}
            {(onDelete || onRemove) && canManageLocations && (
              <button
                onClick={onDelete || onRemove}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                title="Delete location"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <p className="text-teal-100">Pool • Flexible Layout</p>
          <p className="text-white font-medium">{poolBoats.length} boat{poolBoats.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search */}
      {poolBoats.length > 5 && (
        <div className="p-3 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search boats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      )}

      {/* Drop Zone / Boat List */}
      <div
        data-pool-id={location.id}
        className={`p-4 min-h-[150px] ${isDragging ? 'bg-teal-50 border-2 border-dashed border-teal-400' : 'bg-slate-50'}`}
        onDragOver={handleDragOver}
        onDrop={handleDropOnPool}
      >
        {filteredBoats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <Package className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">
              {isDragging ? 'Drop boat here' : poolBoats.length === 0 ? 'No boats in pool' : 'No matches'}
            </p>
            {!isDragging && onAddBoat && (
              <button
                onClick={onAddBoat}
                className="mt-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                + Add boat
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredBoats.map(boat => (
                <BoatCard
                  key={boat.id}
                  boat={boat}
                  onClick={onBoatClick}
                  draggable={onDragStart ? true : false}
                  onDragStart={onDragStart ? (e) => onDragStart(e, boat, location.name) : undefined}
                  onDragEnd={onDragEnd}
                  onTouchStart={onTouchStart ? (e) => onTouchStart(e, boat, location, 'pool') : undefined}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                />
              ))}
            </div>
          {!isDragging && onAddBoat && (
            <div className="flex justify-center mt-3">
              <button
                onClick={onAddBoat}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                + Add boat
              </button>
            </div>
          )}
        </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-100 border-t border-slate-200">
        <p className="text-xs text-slate-500 text-center">
          💡 Drag boats in or out of this pool
        </p>
      </div>
    </div>
  );
}
