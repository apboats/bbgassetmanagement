import React, { useState, useEffect } from 'react';
import { FileText, Calendar, DollarSign, Package, AlertCircle, Printer } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { SummaryCard } from '../components/SharedComponents';

// Print styles - injected into document when printing
const printStyles = `
@media print {
  /* Hide non-printable elements */
  .no-print {
    display: none !important;
  }

  /* Reset page margins */
  @page {
    margin: 0.5in;
    size: landscape;
  }

  /* Ensure table fits on page */
  .print-table {
    width: 100%;
    font-size: 10pt;
    border-collapse: collapse;
  }

  .print-table th,
  .print-table td {
    border: 1px solid #ccc;
    padding: 6px 8px;
    text-align: left;
  }

  .print-table th {
    background-color: #f3f4f6 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Checkbox styling for print */
  .print-checkbox {
    width: 14px;
    height: 14px;
    border: 1.5px solid #333;
    display: inline-block;
    margin-right: 4px;
    vertical-align: middle;
  }

  /* Notes line for print */
  .print-notes-line {
    border-bottom: 1px solid #999;
    min-width: 150px;
    display: inline-block;
  }

  /* Page break handling */
  .print-row {
    page-break-inside: avoid;
  }
}
`;

// Helper: Get the most recent labor activity date for a work order
// Only considers last_worked_at from operations (actual labor punches)
// Ignores last_mod_date/time since that updates for non-labor changes (parts, etc.)
const getLastLaborDate = (wo) => {
  let latestOpDate = null;
  for (const op of (wo.operations || [])) {
    if (op.last_worked_at) {
      const opDate = new Date(op.last_worked_at);
      if (!isNaN(opDate.getTime()) && (!latestOpDate || opDate > latestOpDate)) {
        latestOpDate = opDate;
      }
    }
  }
  return latestOpDate;
};

// Helper: Check if boat is in a shop location
const isBoatInShop = (wo, locations, inventoryBoats) => {
  let boatLocation = null;

  if (wo.boat?.location) {
    // Customer boat - use boat.location
    boatLocation = wo.boat.location;
  } else if (wo.rigging_id) {
    // Internal work order - find inventory boat by rigging_id
    const invBoat = inventoryBoats.find(b => b.dockmaster_id === wo.rigging_id);
    boatLocation = invBoat?.location;
  }

  if (!boatLocation) return false;

  const location = locations.find(l => l.name === boatLocation);
  return location?.type === 'shop' || location?.type === 'workshop';
};

export function ReportsView({ currentUser }) {
  const [unbilledData, setUnbilledData] = useState({ workOrders: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [daysBack, setDaysBack] = useState(7);
  const [expandedWOs, setExpandedWOs] = useState(new Set());

  useEffect(() => {
    loadUnbilledWork();
  }, [daysBack]);

  const loadUnbilledWork = async () => {
    setIsLoading(true);
    setError('');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      cutoffDate.setHours(0, 0, 0, 0); // Start of day for fair comparison

      // Fetch locations to check if boats are in shop
      const { data: locations } = await supabase
        .from('locations')
        .select('id, name, type');

      // Fetch inventory boats for internal work order matching
      const { data: inventoryBoats } = await supabase
        .from('inventory_boats')
        .select('id, dockmaster_id, location');

      // Step 1: Query operations with recent labor activity to get work order IDs
      // Use a direct query on operations table with date filter - much more efficient
      const { data: recentOps, error: opsError } = await supabase
        .from('work_order_operations')
        .select('work_order_id, last_worked_at')
        .gte('last_worked_at', cutoffDate.toISOString());

      if (opsError) throw opsError;

      // Build a map of work_order_id -> latest last_worked_at
      const woLastWorkedMap = new Map();
      for (const op of (recentOps || [])) {
        const existing = woLastWorkedMap.get(op.work_order_id);
        if (!existing || new Date(op.last_worked_at) > new Date(existing)) {
          woLastWorkedMap.set(op.work_order_id, op.last_worked_at);
        }
      }

      const workOrderIds = [...woLastWorkedMap.keys()];

      if (workOrderIds.length === 0) {
        setUnbilledData({ workOrders: [] });
        setIsLoading(false);
        return;
      }

      // Step 2: Fetch work orders in batches (Supabase .in() has limits)
      const BATCH_SIZE = 500;
      const allWorkOrders = [];

      for (let i = 0; i < workOrderIds.length; i += BATCH_SIZE) {
        const batchIds = workOrderIds.slice(i, i + BATCH_SIZE);

        const { data: batchWOs, error: woError } = await supabase
          .from('work_orders')
          .select(`
            *,
            boat:boats(id, name, owner, dockmaster_id, work_order_number, location)
          `)
          .in('id', batchIds)
          .eq('status', 'O')
          .gt('total_charges', 0);

        if (woError) throw woError;
        if (batchWOs) allWorkOrders.push(...batchWOs);
      }

      // Step 3: Fetch operations only for the matching work orders (in batches)
      const matchingWOIds = allWorkOrders.map(wo => wo.id);
      const allOperations = [];

      for (let i = 0; i < matchingWOIds.length; i += BATCH_SIZE) {
        const batchIds = matchingWOIds.slice(i, i + BATCH_SIZE);

        const { data: batchOps, error: batchOpsError } = await supabase
          .from('work_order_operations')
          .select('*')
          .in('work_order_id', batchIds);

        if (batchOpsError) throw batchOpsError;
        if (batchOps) allOperations.push(...batchOps);
      }

      // Group operations by work_order_id
      const opsByWO = new Map();
      for (const op of allOperations) {
        if (!opsByWO.has(op.work_order_id)) {
          opsByWO.set(op.work_order_id, []);
        }
        opsByWO.get(op.work_order_id).push(op);
      }

      // Attach operations to work orders
      const workOrdersWithRecentLabor = allWorkOrders.map(wo => ({
        ...wo,
        operations: opsByWO.get(wo.id) || []
      }));

      // Filter out boats in shop locations
      const filteredWorkOrders = workOrdersWithRecentLabor.filter(wo => {
        return !isBoatInShop(wo, locations || [], inventoryBoats || []);
      });

      // Sort by last labor date (most recent first)
      filteredWorkOrders.sort((a, b) => {
        const dateA = getLastLaborDate(a);
        const dateB = getLastLaborDate(b);
        return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
      });

      setUnbilledData({ workOrders: filteredWorkOrders });
    } catch (err) {
      console.error('Error loading unbilled work:', err);
      setError(err.message || 'Failed to load unbilled work');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleWorkOrder = (woId) => {
    const newExpanded = new Set(expandedWOs);
    if (newExpanded.has(woId)) {
      newExpanded.delete(woId);
    } else {
      newExpanded.add(woId);
    }
    setExpandedWOs(newExpanded);
  };

  // Print handler
  const handlePrint = () => {
    // Inject print styles
    const styleSheet = document.createElement('style');
    styleSheet.id = 'print-styles';
    styleSheet.textContent = printStyles;
    document.head.appendChild(styleSheet);

    // Trigger print
    window.print();

    // Clean up styles after print dialog closes
    setTimeout(() => {
      const existingStyle = document.getElementById('print-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    }, 1000);
  };

  // Calculate totals
  const totalWorkOrders = unbilledData.workOrders.length;
  const totalOperations = unbilledData.workOrders.reduce((sum, wo) => sum + (wo.operations?.length || 0), 0);
  const totalCharges = unbilledData.workOrders.reduce((sum, wo) => sum + (wo.total_charges || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports</h1>
        <p className="text-slate-600">View unbilled work orders and operations with recent updates</p>
      </div>

      {/* Filter Controls */}
      <div className="mb-6 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Calendar className="w-4 h-4" />
          Last Updated:
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="px-3 py-1 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
          </select>
        </label>
        <button
          onClick={loadUnbilledWork}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors no-print"
        >
          Refresh
        </button>
        <button
          onClick={handlePrint}
          disabled={unbilledData.workOrders.length === 0}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 no-print"
        >
          <Printer className="w-4 h-4" />
          Print Report
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Unbilled Work Orders"
          value={totalWorkOrders}
          subtitle="With active charges"
          icon={FileText}
          color="blue"
        />
        <SummaryCard
          title="Total Operations"
          value={totalOperations}
          subtitle="Across all work orders"
          icon={Package}
          color="purple"
        />
        <SummaryCard
          title="Total Charges"
          value={`$${totalCharges.toFixed(2)}`}
          subtitle="Unbilled amount"
          icon={DollarSign}
          color="green"
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Error loading unbilled work</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-3 text-slate-600">Loading unbilled work...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && unbilledData.workOrders.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No unbilled work found</h3>
          <p className="text-slate-600">
            No open work orders with charges updated in the last {daysBack} days
          </p>
        </div>
      )}

      {/* Print Header - only visible when printing */}
      <div className="hidden print:block mb-4">
        <h2 className="text-xl font-bold">Unbilled Work Orders Report</h2>
        <p className="text-sm text-gray-600">
          Generated: {new Date().toLocaleDateString()} | Filter: Last {daysBack} days |
          Total: {totalWorkOrders} work orders | ${totalCharges.toFixed(2)} unbilled
        </p>
      </div>

      {/* Work Orders Table */}
      {!isLoading && unbilledData.workOrders.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden print:shadow-none print:border-0">
          <table className="w-full print-table">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Work Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Boat / Owner
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider no-print">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Charges
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Last Labor
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider no-print">
                  Operations
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider hidden print:table-cell" style={{ width: '200px' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {unbilledData.workOrders.map((wo) => {
                const isExpanded = expandedWOs.has(wo.id);
                const boat = wo.boat || {};
                const operations = wo.operations || [];

                return (
                  <React.Fragment key={wo.id}>
                    {/* Work Order Row */}
                    <tr
                      className="hover:bg-slate-50 cursor-pointer transition-colors print-row"
                      onClick={() => toggleWorkOrder(wo.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-4 h-4 text-slate-400 transition-transform no-print ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="font-mono font-semibold text-slate-900">{wo.id}</span>
                        </div>
                        {wo.title && (
                          <p className="text-xs text-slate-600 mt-1 ml-6 print:ml-0">{wo.title}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{boat.name || 'Unknown Boat'}</p>
                        <p className="text-sm text-slate-600">{boat.owner || 'Unknown Owner'}</p>
                      </td>
                      <td className="px-4 py-3 no-print">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          {wo.category || 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-900">
                          ${(wo.total_charges || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const activityDate = getLastLaborDate(wo);
                          return activityDate ? (
                            <>
                              <p className="text-sm text-slate-700">
                                {activityDate.toLocaleDateString()}
                              </p>
                              <p className="text-xs text-slate-500 no-print">
                                {activityDate.toLocaleTimeString()}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-slate-500">Unknown</p>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center no-print">
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                          {operations.length} ops
                        </span>
                      </td>
                      {/* Billing Status - only visible when printing */}
                      <td className="px-4 py-3 hidden print:table-cell text-xs">
                        <div className="space-y-1">
                          <div>
                            <span className="print-checkbox"></span>
                            <span>Billed</span>
                          </div>
                          <div>
                            <span className="print-checkbox"></span>
                            <span>Not billed:</span>
                            <span className="print-notes-line ml-1"></span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Operations - hidden when printing */}
                    {isExpanded && operations.length > 0 && (
                      <tr className="no-print">
                        <td colSpan={6} className="px-4 py-2 bg-slate-50">
                          <div className="pl-6">
                            <p className="text-xs font-semibold text-slate-700 uppercase mb-2">Operations</p>
                            <div className="space-y-1">
                              {operations.map((op, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-2 bg-white rounded border border-slate-200"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs font-semibold text-slate-700">
                                      {op.opcode}
                                    </span>
                                    <span className="text-sm text-slate-600">
                                      {op.opcode_desc || 'No description'}
                                    </span>
                                    {op.flag_labor_finished && (
                                      <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded uppercase">
                                        Unbilled
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-semibold text-slate-900">
                                    ${(op.total_charges || 0).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
