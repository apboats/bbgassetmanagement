import React from 'react';
import { Map, Edit2 } from 'lucide-react';
import { findBoatLocationData, useBoatLocation } from './BoatComponents';

export function InventoryBoatCard({ boat, onView, locations = [] }) {
  const salesStatusLabels = {
    'HA': { label: 'On Hand Available', color: 'bg-green-500' },
    'HS': { label: 'On Hand Sold', color: 'bg-emerald-600' },
    'OA': { label: 'On Order Available', color: 'bg-blue-500' },
    'OS': { label: 'On Order Sold', color: 'bg-blue-600' },
    'FA': { label: 'Future Available', color: 'bg-amber-500' },
    'FS': { label: 'Future Sold', color: 'bg-amber-600' },
    'S': { label: 'Sold', color: 'bg-purple-500' },
    'R': { label: 'Reserved', color: 'bg-indigo-500' },
    'FP': { label: 'Floor Planned', color: 'bg-slate-500' }
  };

  const statusInfo = salesStatusLabels[boat.salesStatus] || { label: boat.salesStatus || 'Unknown', color: 'bg-slate-400' };

  // Use centralized location finding logic
  const { enrichedBoat } = findBoatLocationData(boat, locations);
  const { displayLocation, displaySlot } = useBoatLocation(enrichedBoat, locations);

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      {/* Sales Status Header */}
      <div className={`${statusInfo.color} p-3`}>
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold text-sm">{statusInfo.label}</span>
          <span className="text-white text-xs opacity-90 font-mono">{boat.qrCode || `INV-${boat.dockmasterId}`}</span>
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">{boat.name}</h3>
        <p className="text-slate-600 text-sm mb-3">{boat.year} {boat.model}</p>

        <div className="space-y-2 text-sm">
          {/* Make/Manufacturer */}
          <div className="flex items-center gap-2 text-slate-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span>{boat.make || 'Unknown Make'}</span>
          </div>

          {/* Location if assigned */}
          {enrichedBoat.location && (
            <div className="flex items-center gap-2 text-slate-600">
              <Map className="w-4 h-4" />
              <span>
                {displayLocation}
                {displaySlot && ` • ${displaySlot}`}
              </span>
            </div>
          )}

          {/* Hull ID */}
          {boat.hullId && (
            <div className="flex items-center gap-2 text-slate-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              <span className="font-mono text-xs">{boat.hullId}</span>
            </div>
          )}
        </div>

        {/* Inventory Badge */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              Inventory
            </span>
            {boat.length && (
              <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                {boat.length}
              </span>
            )}
            <span className={`px-2 py-1 text-xs font-bold rounded-full ${statusInfo.color} text-white`}>
              {boat.salesStatus}
            </span>
          </div>
        </div>

        {/* View Details Button */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <button
            onClick={onView}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}
