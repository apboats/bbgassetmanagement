// ============================================================================
// ESTIMATE DETAILS MODAL
// ============================================================================
// Modal component for displaying detailed estimate information from Dockmaster
// Shows line items with calculated freight (7% of parts) and shop supplies (10% of labor)
// Can be used across all components that display estimates
// ============================================================================

import { useState } from 'react';
import { X, DollarSign, FileText, Calendar, Ship, Truck, Wrench, Package, Calculator } from 'lucide-react';

export function EstimateDetailsModal({ estimate, onClose }) {
  if (!estimate) return null;

  // Handle both camelCase (API) and snake_case (cached) field names
  const totalParts = estimate.totalParts ?? estimate.total_parts ?? 0;
  const totalLabor = estimate.totalLabor ?? estimate.total_labor ?? 0;
  const totalCharges = estimate.totalCharges ?? estimate.total_charges ?? 0;
  const totalFreight = estimate.totalFreight ?? estimate.total_freight ?? 0;
  const totalSublet = estimate.totalSublet ?? estimate.total_sublet ?? 0;
  const totalEquipment = estimate.totalEquipment ?? estimate.total_equipment ?? 0;
  const totalMileage = estimate.totalMileage ?? estimate.total_mileage ?? 0;
  const totalMiscSupply = estimate.totalMiscSupply ?? estimate.total_misc_supply ?? 0;

  const creationDate = estimate.creationDate || estimate.creation_date;
  const estCompDate = estimate.estCompDate || estimate.est_comp_date;
  const promisedDate = estimate.promisedDate || estimate.promised_date;

  const boatName = estimate.boatName || estimate.boat_name || '';
  const boatYear = estimate.boatYear || estimate.boat_year || '';
  const boatMake = estimate.boatMake || estimate.boat_make || '';
  const boatModel = estimate.boatModel || estimate.boat_model || '';
  const customerName = estimate.customerName || estimate.customer_name || '';
  const riggingId = estimate.riggingId || estimate.rigging_id || '';

  const operations = estimate.operations || [];

  // Calculate totals from operations for more accurate breakdown
  let opsPartsTotal = 0;
  let opsLaborTotal = 0;
  let opsOtherTotal = 0;

  operations.forEach(op => {
    const opParts = op.estimatedParts ?? op.estimated_parts ?? op.totalParts ?? op.total_parts ?? 0;
    const opLabor = op.estimatedLabor ?? op.estimated_labor ?? op.totalLabor ?? op.total_labor ?? 0;
    const opCharges = op.estimatedCharges ?? op.estimated_charges ?? op.totalCharges ?? op.total_charges ?? 0;
    const opFreight = op.estimatedFreight ?? op.estimated_freight ?? op.totalFreight ?? op.total_freight ?? 0;
    const opSublet = op.estimatedSublet ?? op.estimated_sublet ?? op.totalSublet ?? op.total_sublet ?? 0;
    const opEquipment = op.estimatedEquipment ?? op.estimated_equipment ?? op.totalEquipment ?? op.total_equipment ?? 0;

    opsPartsTotal += opParts;
    opsLaborTotal += opLabor;
    opsOtherTotal += opFreight + opSublet + opEquipment;
  });

  // Use operation totals if available, fall back to estimate-level totals
  const partsSubtotal = opsPartsTotal > 0 ? opsPartsTotal : totalParts;
  const laborSubtotal = opsLaborTotal > 0 ? opsLaborTotal : totalLabor;

  // Calculate freight (7% of parts) and shop supplies (10% of labor)
  const FREIGHT_RATE = 0.07;
  const SHOP_SUPPLIES_RATE = 0.10;

  const calculatedFreight = partsSubtotal * FREIGHT_RATE;
  const calculatedShopSupplies = laborSubtotal * SHOP_SUPPLIES_RATE;

  // Other charges from estimate
  const otherCharges = totalSublet + totalEquipment + totalMileage + totalMiscSupply + (totalFreight > 0 ? totalFreight : 0);

  // Grand total with calculated charges
  const grandTotal = partsSubtotal + laborSubtotal + calculatedFreight + calculatedShopSupplies + otherCharges + opsOtherTotal;

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '$0.00';
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    if (dateStr.includes('T')) {
      return new Date(dateStr).toLocaleDateString();
    }
    return dateStr;
  };

  const statusColor = estimate.status === 'O'
    ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
    : 'bg-green-100 text-green-700 border-green-300';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-700 flex items-center justify-center">
                <Calculator className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold">Estimate #{estimate.id}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
                    {estimate.status === 'O' ? 'Open' : 'Closed'}
                  </span>
                </div>
                {estimate.title && (
                  <p className="text-sm text-amber-100 mt-0.5">{estimate.title}</p>
                )}
                {customerName && (
                  <p className="text-xs text-amber-200 mt-1">Customer: {customerName}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Boat Info Card */}
          {(boatYear || boatMake || boatModel || riggingId) && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Ship className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-blue-900">Boat Information</h4>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {(boatYear || boatMake || boatModel) && (
                  <div>
                    <p className="text-xs text-blue-600">Boat</p>
                    <p className="font-medium text-blue-900">
                      {[boatYear, boatMake, boatModel].filter(Boolean).join(' ')}
                    </p>
                  </div>
                )}
                {riggingId && (
                  <div>
                    <p className="text-xs text-blue-600">Rigging ID</p>
                    <p className="font-mono font-medium text-blue-900">{riggingId}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dates Card */}
          {(creationDate || estCompDate || promisedDate) && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-slate-600" />
                <h4 className="font-semibold text-slate-800">Dates</h4>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                {creationDate && (
                  <div>
                    <p className="text-xs text-slate-500">Created</p>
                    <p className="font-medium text-slate-900">{formatDate(creationDate)}</p>
                  </div>
                )}
                {estCompDate && (
                  <div>
                    <p className="text-xs text-slate-500">Est. Complete</p>
                    <p className="font-medium text-slate-900">{formatDate(estCompDate)}</p>
                  </div>
                )}
                {promisedDate && (
                  <div>
                    <p className="text-xs text-slate-500">Promised</p>
                    <p className="font-medium text-slate-900">{formatDate(promisedDate)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comments */}
          {estimate.comments && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-slate-600" />
                <h4 className="font-semibold text-slate-800">Comments</h4>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{estimate.comments}</p>
            </div>
          )}

          {/* Line Items (Operations) */}
          <div className="bg-white rounded-xl border-2 border-slate-300 overflow-hidden">
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-300">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-slate-600" />
                <h4 className="font-semibold text-slate-800">Line Items ({operations.length})</h4>
              </div>
            </div>

            {operations.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-slate-500">No line items on this estimate</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {operations.map((op, idx) => {
                  const opcodeDesc = op.opcodeDesc || op.opcode_desc || '';
                  const longDesc = op.longDesc || op.long_desc || '';
                  const opCharges = op.estimatedCharges ?? op.estimated_charges ?? op.totalCharges ?? op.total_charges ?? 0;
                  const opParts = op.estimatedParts ?? op.estimated_parts ?? op.totalParts ?? op.total_parts ?? 0;
                  const opLabor = op.estimatedLabor ?? op.estimated_labor ?? op.totalLabor ?? op.total_labor ?? 0;
                  const opLaborHours = op.estimatedLaborHours ?? op.estimated_labor_hours ?? op.totalLaborHours ?? op.total_labor_hours ?? 0;

                  return (
                    <div key={op.id || idx} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                              {op.opcode}
                            </span>
                            {op.status && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                op.status === 'O' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {op.status === 'O' ? 'Open' : 'Closed'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-900 mt-1">
                            {opcodeDesc || 'No description'}
                          </p>
                          {longDesc && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{longDesc}</p>
                          )}

                          {/* Breakdown */}
                          <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-600">
                            {opParts > 0 && (
                              <span className="flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                Parts: {formatCurrency(opParts)}
                              </span>
                            )}
                            {opLabor > 0 && (
                              <span className="flex items-center gap-1">
                                <Wrench className="w-3 h-3" />
                                Labor: {formatCurrency(opLabor)}
                                {opLaborHours > 0 && ` (${opLaborHours.toFixed(1)} hrs)`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-bold text-slate-900">
                            {formatCurrency(opCharges)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Totals Summary */}
          <div className="bg-amber-50 rounded-xl border-2 border-amber-300 overflow-hidden">
            <div className="bg-amber-100 px-4 py-3 border-b border-amber-300">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-700" />
                <h4 className="font-semibold text-amber-900">Estimate Totals</h4>
              </div>
            </div>

            <div className="p-4 space-y-2">
              {/* Parts Section */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-700 flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-500" />
                  Parts Subtotal
                </span>
                <span className="font-medium text-slate-900">{formatCurrency(partsSubtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm pl-6">
                <span className="text-slate-600 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-slate-400" />
                  Freight (7% of parts)
                </span>
                <span className="text-slate-700">{formatCurrency(calculatedFreight)}</span>
              </div>

              <div className="border-t border-amber-200 my-2" />

              {/* Labor Section */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-700 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-500" />
                  Labor Subtotal
                </span>
                <span className="font-medium text-slate-900">{formatCurrency(laborSubtotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm pl-6">
                <span className="text-slate-600">
                  Shop Supplies (10% of labor)
                </span>
                <span className="text-slate-700">{formatCurrency(calculatedShopSupplies)}</span>
              </div>

              {/* Other charges if any */}
              {(otherCharges > 0 || opsOtherTotal > 0) && (
                <>
                  <div className="border-t border-amber-200 my-2" />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-700">Other Charges</span>
                    <span className="font-medium text-slate-900">{formatCurrency(otherCharges + opsOtherTotal)}</span>
                  </div>
                </>
              )}

              {/* Grand Total */}
              <div className="border-t-2 border-amber-400 mt-3 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-amber-900">Estimated Total</span>
                  <span className="text-2xl font-bold text-amber-700">{formatCurrency(grandTotal)}</span>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  Includes calculated freight and shop supplies
                </p>
              </div>

              {/* Original total comparison */}
              {totalCharges > 0 && Math.abs(totalCharges - grandTotal) > 1 && (
                <div className="mt-2 pt-2 border-t border-amber-200">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Original Dockmaster Total:</span>
                    <span className="text-slate-600 font-medium">{formatCurrency(totalCharges)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex-shrink-0">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              {estimate.last_synced && `Last synced: ${new Date(estimate.last_synced).toLocaleString()}`}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EstimateDetailsModal;
