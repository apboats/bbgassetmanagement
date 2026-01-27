// ============================================================================
// WORK ORDERS MODAL
// ============================================================================
// Shared modal component for displaying work orders
// Used by both BoatDetailsModal and InventoryBoatDetailsModal
// ============================================================================

import React, { useState } from 'react';
import { X, Wrench, DollarSign } from 'lucide-react';
import { OperationDetailsModal } from './OperationDetailsModal';

export function WorkOrdersModal({
  workOrders = [],
  boatName = '',
  boatOwner = '',
  lastSynced = null,
  fromCache = false,
  loading = false,
  onRefresh = null,
  onClose,
  variant = 'customer' // 'customer' or 'inventory'
}) {
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(null);

  const isInventory = variant === 'inventory';
  const headerGradient = isInventory
    ? 'from-purple-600 to-purple-700'
    : 'from-slate-600 to-slate-700';
  const headerHoverBg = isInventory ? 'hover:bg-purple-500' : 'hover:bg-slate-500';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-in">
        {/* Header */}
        <div className={`bg-gradient-to-r ${headerGradient} text-white p-4 flex-shrink-0`}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-bold">
                {isInventory ? 'Work Orders' : 'Open Work Orders'}
              </h3>
              <p className={`text-sm ${isInventory ? 'text-purple-200' : 'text-slate-300'}`}>
                {boatName}
                {boatOwner && !isInventory && ` - ${boatOwner}`}
              </p>
              {lastSynced && !isInventory && (
                <p className="text-xs text-slate-400 mt-1">
                  {fromCache ? 'Cached' : 'Synced'}: {new Date(lastSynced).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onRefresh && !isInventory && (
                <button
                  onClick={onRefresh}
                  disabled={loading}
                  className={`flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white text-sm font-medium rounded-lg transition-colors`}
                  title="Refresh from Dockmaster"
                >
                  <svg
                    className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {loading ? 'Syncing...' : 'Refresh'}
                </button>
              )}
              <button
                onClick={onClose}
                className={`p-1 ${headerHoverBg} rounded transition-colors`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {workOrders.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">
                {isInventory ? 'No Open Work Orders' : 'No open work orders found for this boat.'}
              </p>
              {isInventory ? (
                <p className="text-sm text-slate-400 mt-1">
                  No rigging or prep work orders found for this boat
                </p>
              ) : (
                onRefresh && (
                  <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {loading ? 'Checking...' : 'Check Dockmaster'}
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {workOrders.map((wo) => (
                <div
                  key={wo.id}
                  className="border-2 border-slate-300 rounded-xl overflow-hidden shadow-md bg-white"
                >
                  {/* Work Order Header */}
                  <div className="bg-gradient-to-r from-slate-100 to-slate-50 p-4 border-b-2 border-slate-300">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-slate-900 font-mono">
                            WO# {wo.id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              wo.status === 'O'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {wo.status === 'O' ? 'Open' : 'Closed'}
                          </span>
                        </div>
                        {wo.title && (
                          <p className="text-sm text-slate-600 mt-1">{wo.title}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900">
                          ${(wo.totalCharges ?? wo.total_charges ?? 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-500">Total Charges</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span>Created: {wo.creationDate}</span>
                      {wo.category && <span>Category: {wo.category}</span>}
                    </div>
                  </div>

                  {/* Operations List */}
                  {wo.operations && wo.operations.length > 0 && (
                    <div className="p-4 bg-slate-50">
                      <p className="text-xs font-medium text-slate-500 uppercase mb-3">
                        Operations ({wo.operations.length})
                      </p>
                      <div className="space-y-2">
                        {wo.operations.map((op, idx) => {
                          const isClosed = op.status === 'C';
                          // Handle both camelCase and snake_case field names (API vs cached data)
                          const flagLaborFinished = op.flagLaborFinished || op.flag_labor_finished;
                          const isUnbilled = !isClosed && flagLaborFinished;
                          const totalCharges = op.totalCharges ?? op.total_charges ?? 0;
                          const opcodeDesc = op.opcodeDesc || op.opcode_desc;

                          return (
                            <div
                              key={op.id || idx}
                              onClick={() => {
                                setSelectedOperation(op);
                                setSelectedWorkOrderId(wo.id);
                              }}
                              className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                                isClosed
                                  ? 'bg-green-50 border-green-200 hover:border-green-400'
                                  : isUnbilled
                                  ? 'bg-orange-50 border-orange-300 hover:border-orange-400'
                                  : 'bg-white border-slate-200 hover:border-blue-400'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div
                                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                                    isClosed
                                      ? 'bg-green-500'
                                      : isUnbilled
                                      ? 'bg-orange-500'
                                      : 'bg-slate-300'
                                  }`}
                                >
                                  {isClosed ? (
                                    <svg
                                      className="w-4 h-4 text-white"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  ) : isUnbilled ? (
                                    <DollarSign className="w-4 h-4 text-white" />
                                  ) : (
                                    <span className="text-xs text-white font-bold">
                                      {idx + 1}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-slate-900">
                                      {opcodeDesc || op.opcode}
                                    </p>
                                    {isUnbilled && (
                                      <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded uppercase">
                                        Unbilled
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500">
                                    {op.opcode}
                                    {op.type && ` • ${op.type}`}
                                    {' • '}
                                    {op.status === 'O' ? 'Open' : 'Closed'}
                                  </p>
                                </div>
                              </div>
                              {totalCharges > 0 && (
                                <span className="text-sm font-medium text-slate-700 flex-shrink-0 ml-2">
                                  ${totalCharges.toFixed(2)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            {isInventory && lastSynced ? (
              <p className="text-xs text-slate-500">
                Data as of {new Date(lastSynced).toLocaleString()}
              </p>
            ) : isInventory ? (
              <p className="text-xs text-slate-500">
                Sync work orders from Inventory page
              </p>
            ) : (
              <div />
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Operation Details Modal */}
      {selectedOperation && (
        <OperationDetailsModal
          operation={selectedOperation}
          workOrderId={selectedWorkOrderId}
          onClose={() => {
            setSelectedOperation(null);
            setSelectedWorkOrderId(null);
          }}
        />
      )}
    </div>
  );
}

export default WorkOrdersModal;
