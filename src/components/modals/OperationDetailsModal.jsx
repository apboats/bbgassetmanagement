// ============================================================================
// OPERATION DETAILS MODAL
// ============================================================================
// Modal component for displaying detailed operation/opcode information
// Shows technician descriptions, financial breakdown, scheduling, etc.
// ============================================================================

import React from 'react';
import { X, Clock, DollarSign, Wrench, FileText, Calendar, CheckCircle, AlertCircle } from 'lucide-react';

export function OperationDetailsModal({ operation, workOrderId, onClose }) {
  if (!operation) return null;

  // Handle both camelCase (API) and snake_case (cached) field names
  const opcodeDesc = operation.opcodeDesc || operation.opcode_desc || '';
  const longDesc = operation.longDesc || operation.long_desc || '';
  const techDesc = operation.techDesc || operation.tech_desc || '';
  const managerComments = operation.managerComments || operation.manager_comments || '';

  const totalCharges = operation.totalCharges ?? operation.total_charges ?? 0;
  const totalParts = operation.totalParts ?? operation.total_parts ?? 0;
  const totalLabor = operation.totalLabor ?? operation.total_labor ?? 0;
  const totalLaborHours = operation.totalLaborHours ?? operation.total_labor_hours ?? 0;
  const totalFreight = operation.totalFreight ?? operation.total_freight ?? 0;
  const totalEquipment = operation.totalEquipment ?? operation.total_equipment ?? 0;
  const totalSublet = operation.totalSublet ?? operation.total_sublet ?? 0;
  const totalMileage = operation.totalMileage ?? operation.total_mileage ?? 0;
  const totalMiscSupply = operation.totalMiscSupply ?? operation.total_misc_supply ?? 0;

  const estimatedCharges = operation.estimatedCharges ?? operation.estimated_charges ?? 0;
  const estimatedParts = operation.estimatedParts ?? operation.estimated_parts ?? 0;
  const estimatedLabor = operation.estimatedLabor ?? operation.estimated_labor ?? 0;
  const estimatedLaborHours = operation.estimatedLaborHours ?? operation.estimated_labor_hours ?? 0;

  const flagLaborFinished = operation.flagLaborFinished || operation.flag_labor_finished;
  const isOpcodeApproved = operation.isOpcodeApproved || operation.is_opcode_approved;
  const laborBilled = operation.laborBilled ?? operation.labor_billed ?? 0;

  const estStartDate = operation.estStartDate || operation.est_start_date;
  const estCompleteDate = operation.estCompleteDate || operation.est_complete_date;
  const reqCompDate = operation.reqCompDate || operation.req_comp_date;
  const lastWorkedAt = operation.lastWorkedAt || operation.last_worked_at;
  const standardHours = operation.standardHours ?? operation.standard_hours ?? 0;

  const flatRateAmount = operation.flatRateAmount ?? operation.flat_rate_amount ?? 0;

  const isClosed = operation.status === 'C';
  const isUnbilled = !isClosed && flagLaborFinished;

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === 0) return '-';
    return `$${Number(value).toFixed(2)}`;
  };

  const formatHours = (value) => {
    if (value === null || value === undefined || value === 0) return '-';
    return `${Number(value).toFixed(2)} hrs`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    // Handle ISO timestamp
    if (dateStr.includes('T')) {
      return new Date(dateStr).toLocaleString();
    }
    return dateStr;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-in">
        {/* Header */}
        <div className={`bg-gradient-to-r ${isClosed ? 'from-green-600 to-green-700' : isUnbilled ? 'from-orange-500 to-orange-600' : 'from-blue-600 to-blue-700'} text-white p-4 flex-shrink-0`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isClosed ? 'bg-green-800' : isUnbilled ? 'bg-orange-700' : 'bg-blue-800'}`}>
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{operation.opcode}</h3>
                <p className="text-sm opacity-90">{opcodeDesc}</p>
                {workOrderId && (
                  <p className="text-xs opacity-75 mt-1">WO# {workOrderId}</p>
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

          {/* Status badges */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isClosed ? 'bg-green-800 text-green-100' : 'bg-yellow-100 text-yellow-800'}`}>
              {isClosed ? 'Closed' : 'Open'}
            </span>
            {flagLaborFinished && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                Labor Complete
              </span>
            )}
            {isUnbilled && (
              <span className="px-2 py-0.5 bg-orange-800 text-orange-100 rounded-full text-xs font-bold">
                UNBILLED
              </span>
            )}
            {isOpcodeApproved && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-medium">
                Approved
              </span>
            )}
            {operation.type && (
              <span className="px-2 py-0.5 bg-white/20 text-white rounded-full text-xs">
                Type: {operation.type}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Financial Summary Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-5 h-5 text-green-600" />
              <h4 className="font-semibold text-slate-800">Financial Summary</h4>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Actual */}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Actual</p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Total Charges:</span>
                    <span className="text-sm font-semibold text-slate-900">{formatCurrency(totalCharges)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Parts:</span>
                    <span className="text-sm text-slate-900">{formatCurrency(totalParts)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Labor:</span>
                    <span className="text-sm text-slate-900">{formatCurrency(totalLabor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Labor Hours:</span>
                    <span className="text-sm text-slate-900">{formatHours(totalLaborHours)}</span>
                  </div>
                  {totalFreight > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Freight:</span>
                      <span className="text-sm text-slate-900">{formatCurrency(totalFreight)}</span>
                    </div>
                  )}
                  {totalSublet > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Sublet:</span>
                      <span className="text-sm text-slate-900">{formatCurrency(totalSublet)}</span>
                    </div>
                  )}
                  {totalEquipment > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Equipment:</span>
                      <span className="text-sm text-slate-900">{formatCurrency(totalEquipment)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Estimated */}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Estimated</p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Total:</span>
                    <span className="text-sm font-semibold text-slate-900">{formatCurrency(estimatedCharges)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Parts:</span>
                    <span className="text-sm text-slate-900">{formatCurrency(estimatedParts)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Labor:</span>
                    <span className="text-sm text-slate-900">{formatCurrency(estimatedLabor)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Labor Hours:</span>
                    <span className="text-sm text-slate-900">{formatHours(estimatedLaborHours)}</span>
                  </div>
                  {standardHours > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Standard Hours:</span>
                      <span className="text-sm text-slate-900">{formatHours(standardHours)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Billed vs Unbilled */}
            {(totalLabor > 0 || laborBilled > 0) && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Labor Billed:</span>
                  <span className={`text-sm font-semibold ${laborBilled >= totalLabor ? 'text-green-600' : 'text-orange-600'}`}>
                    {formatCurrency(laborBilled)} / {formatCurrency(totalLabor)}
                  </span>
                </div>
              </div>
            )}

            {flatRateAmount > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Flat Rate Amount:</span>
                  <span className="text-sm font-semibold text-blue-600">{formatCurrency(flatRateAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Scheduling Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h4 className="font-semibold text-slate-800">Scheduling</h4>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                {estStartDate && (
                  <div>
                    <p className="text-xs text-slate-500">Est. Start Date</p>
                    <p className="text-sm text-slate-900">{formatDate(estStartDate)}</p>
                  </div>
                )}
                {estCompleteDate && (
                  <div>
                    <p className="text-xs text-slate-500">Est. Complete Date</p>
                    <p className="text-sm text-slate-900">{formatDate(estCompleteDate)}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {reqCompDate && (
                  <div>
                    <p className="text-xs text-slate-500">Requested Complete Date</p>
                    <p className="text-sm text-slate-900">{formatDate(reqCompDate)}</p>
                  </div>
                )}
                {lastWorkedAt && (
                  <div>
                    <p className="text-xs text-slate-500">Last Worked</p>
                    <p className="text-sm text-slate-900 font-medium">{formatDate(lastWorkedAt)}</p>
                  </div>
                )}
              </div>
            </div>
            {!estStartDate && !estCompleteDate && !reqCompDate && !lastWorkedAt && (
              <p className="text-sm text-slate-400 italic">No scheduling information available</p>
            )}
          </div>

          {/* Descriptions Card */}
          {(longDesc || techDesc || managerComments) && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-slate-800">Notes & Descriptions</h4>
              </div>
              <div className="space-y-3">
                {longDesc && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Description</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap bg-white p-2 rounded border border-slate-100">{longDesc}</p>
                  </div>
                )}
                {techDesc && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Technician Notes</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap bg-white p-2 rounded border border-slate-100">{techDesc}</p>
                  </div>
                )}
                {managerComments && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Manager Comments</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap bg-white p-2 rounded border border-slate-100">{managerComments}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No descriptions fallback */}
          {!longDesc && !techDesc && !managerComments && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-slate-400" />
                <h4 className="font-semibold text-slate-600">Notes & Descriptions</h4>
              </div>
              <p className="text-sm text-slate-400 italic">No notes or descriptions available for this operation</p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex-shrink-0">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OperationDetailsModal;
