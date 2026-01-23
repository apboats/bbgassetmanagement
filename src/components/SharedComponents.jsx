import React from 'react';
import { Users, Map, Edit2, Trash2 } from 'lucide-react';
import { getActiveSeason } from '../utils/seasonHelpers';

// Navigation Button Component  
export function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active 
          ? 'bg-blue-100 text-blue-700' 
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// Summary Card for Dashboard
export function SummaryCard({ title, value, subtitle, icon: Icon, color, onClick }) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    green: 'from-green-500 to-green-600'
  };

  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl shadow-md p-6 border border-slate-200 ${onClick ? 'cursor-pointer hover:shadow-lg transition-all' : ''}`}
    >
      <div className={`w-12 h-12 bg-gradient-to-br ${colors[color]} rounded-lg flex items-center justify-center mb-4`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <p className="text-slate-600 text-sm font-medium mb-1">{title}</p>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      {subtitle && (
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

// Status Card for Dashboard
export function StatusCard({ status, count, label }) {
  return (
    <div className="text-center">
      <div className={`status-${status} h-24 rounded-lg flex items-center justify-center mb-2 shadow-sm`}>
        <span className="text-4xl font-bold text-white">{count}</span>
      </div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
    </div>
  );
}

// Customer Boat Card Component
export function CustomerBoatCard({ boat, onEdit, onDelete, compact }) {
  const statusLabels = {
    'needs-approval': 'Needs Approval',
    'needs-parts': 'Needs Parts',
    'parts-kit-pulled': 'Parts Kit Pulled',
    'on-deck': 'On Deck',
    'all-work-complete': 'All Work Complete',
    'archived': 'Released'
  };

  return (
    <div className="boat-card bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      {boat.storageBoat ? (
        // Storage boat - 3 horizontal colored sections with dynamic widths based on active season
        (() => {
          const activeSeason = getActiveSeason(boat);
          const allComplete = boat.fallStatus === 'all-work-complete' &&
                             boat.winterStatus === 'all-work-complete' &&
                             boat.springStatus === 'all-work-complete';

          // Determine width classes based on active season
          const fallWidth = allComplete ? 'flex-[1]' : (activeSeason === 'fall' ? 'flex-[2]' : 'flex-[1]');
          const winterWidth = allComplete ? 'flex-[1]' : (activeSeason === 'winter' ? 'flex-[2]' : 'flex-[1]');
          const springWidth = allComplete ? 'flex-[1]' : (activeSeason === 'spring' ? 'flex-[2]' : 'flex-[1]');

          return (
            <div className="flex h-12">
              <div className={`status-${boat.fallStatus} ${fallWidth} border-r border-white/20`}></div>
              <div className={`status-${boat.winterStatus} ${winterWidth} border-r border-white/20`}></div>
              <div className={`status-${boat.springStatus} ${springWidth}`}></div>
            </div>
          );
        })()
      ) : (
        // Regular boat - single colored bar with status label and QR code
        <div className={`status-${boat.status} p-3`}>
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold text-sm">{statusLabels[boat.status]}</span>
            <span className="text-white text-xs opacity-90">{boat.qrCode}</span>
          </div>
        </div>
      )}
      <div className="p-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">{boat.name}</h3>
        <p className="text-slate-600 text-sm mb-3">{boat.model}</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <Users className="w-4 h-4" />
            <span>{boat.owner}</span>
          </div>
          {boat.location && (
            <div className="flex items-center gap-2 text-slate-600">
              <Map className="w-4 h-4" />
              <span>{boat.location} ({boat.slot})</span>
            </div>
          )}
          {boat.nfcTag && (
            <div className="flex items-center gap-2 text-purple-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="font-mono font-semibold">{boat.nfcTag}</span>
            </div>
          )}
        </div>

        {/* Work Phase Checkboxes */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex gap-2 text-xs">
            {boat.storageBoat ? (
              // Storage boat - use active season's work phases
              <>
                {(() => {
                  const activeSeason = getActiveSeason(boat);
                  return (
                    <>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={boat[`${activeSeason}MechanicalsComplete`] || false}
                          readOnly
                          className="w-3 h-3 rounded pointer-events-none"
                        />
                        <span className={boat[`${activeSeason}MechanicalsComplete`] ? 'text-green-600 font-medium' : 'text-slate-500'}>
                          Mech
                        </span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={boat[`${activeSeason}CleanComplete`] || false}
                          readOnly
                          className="w-3 h-3 rounded pointer-events-none"
                        />
                        <span className={boat[`${activeSeason}CleanComplete`] ? 'text-green-600 font-medium' : 'text-slate-500'}>
                          Clean
                        </span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={boat[`${activeSeason}FiberglassComplete`] || false}
                          readOnly
                          className="w-3 h-3 rounded pointer-events-none"
                        />
                        <span className={boat[`${activeSeason}FiberglassComplete`] ? 'text-green-600 font-medium' : 'text-slate-500'}>
                          Fiber
                        </span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={boat[`${activeSeason}WarrantyComplete`] || false}
                          readOnly
                          className="w-3 h-3 rounded pointer-events-none"
                        />
                        <span className={boat[`${activeSeason}WarrantyComplete`] ? 'text-green-600 font-medium' : 'text-slate-500'}>
                          Warr
                        </span>
                      </label>
                    </>
                  );
                })()}
              </>
            ) : (
              // Regular boat - use regular work phases
              <>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={boat.mechanicalsComplete || false}
                    readOnly
                    className="w-3 h-3 rounded pointer-events-none"
                  />
                  <span className={boat.mechanicalsComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                    Mech
                  </span>
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={boat.cleanComplete || false}
                    readOnly
                    className="w-3 h-3 rounded pointer-events-none"
                  />
                  <span className={boat.cleanComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                    Clean
                  </span>
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={boat.fiberglassComplete || false}
                    readOnly
                    className="w-3 h-3 rounded pointer-events-none"
                  />
                  <span className={boat.fiberglassComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                    Fiber
                  </span>
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={boat.warrantyComplete || false}
                    readOnly
                    className="w-3 h-3 rounded pointer-events-none"
                  />
                  <span className={boat.warrantyComplete ? 'text-green-600 font-medium' : 'text-slate-500'}>
                    Warr
                  </span>
                </label>
              </>
            )}
          </div>
          {/* Pending work badges */}
          {boat.storageBoat ? (
            // Storage boat - check active season's phases
            (() => {
              const activeSeason = getActiveSeason(boat);
              const mechanicalsComplete = boat[`${activeSeason}MechanicalsComplete`];
              const cleanComplete = boat[`${activeSeason}CleanComplete`];
              const fiberglassComplete = boat[`${activeSeason}FiberglassComplete`];
              const warrantyComplete = boat[`${activeSeason}WarrantyComplete`];

              return (!mechanicalsComplete || !cleanComplete || !fiberglassComplete || !warrantyComplete) && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {!mechanicalsComplete && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-medium rounded-full">
                      Needs Mech
                    </span>
                  )}
                  {!cleanComplete && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded-full">
                      Needs Clean
                    </span>
                  )}
                  {!fiberglassComplete && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-medium rounded-full">
                      Needs Fiber
                    </span>
                  )}
                  {!warrantyComplete && (
                    <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-medium rounded-full">
                      Needs Warr
                    </span>
                  )}
                </div>
              );
            })()
          ) : (
            // Regular boat - check regular phases
            (!boat.mechanicalsComplete || !boat.cleanComplete || !boat.fiberglassComplete || !boat.warrantyComplete) && (
              <div className="flex flex-wrap gap-1 mt-2">
                {!boat.mechanicalsComplete && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-medium rounded-full">
                    Needs Mech
                  </span>
                )}
                {!boat.cleanComplete && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded-full">
                    Needs Clean
                  </span>
                )}
                {!boat.fiberglassComplete && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-medium rounded-full">
                    Needs Fiber
                  </span>
                )}
                {!boat.warrantyComplete && (
                  <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-medium rounded-full">
                    Needs Warr
                  </span>
                )}
              </div>
            )
          )}
        </div>

        {!compact && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
            <button
              onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              View Details
            </button>
            <button
              onClick={onDelete}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
