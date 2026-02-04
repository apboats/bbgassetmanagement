import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Calendar, DollarSign, Package, AlertCircle, Printer, Save, Send, CheckCircle, Clock, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { SummaryCard } from '../components/SharedComponents';
import { WorkOrdersModal } from '../components/modals/WorkOrdersModal';
import { OperationDetailsModal } from '../components/modals/OperationDetailsModal';

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

// Helper: Get Monday of a given week
const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper: Get Sunday of a given week
const getSunday = (date) => {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
};

// Helper: Format date as YYYY-MM-DD for database
const formatDateForDB = (date) => {
  return date.toISOString().split('T')[0];
};

// Helper: Format date range for display
const formatWeekRange = (monday, sunday) => {
  const options = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString('en-US', options)} - ${sunday.toLocaleDateString('en-US', options)}, ${monday.getFullYear()}`;
};

// Helper: Get the most recent labor activity date for a work order
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
    boatLocation = wo.boat.location;
  } else if (wo.rigging_id) {
    const invBoat = inventoryBoats.find(b => b.dockmaster_id === wo.rigging_id);
    boatLocation = invBoat?.location;
  }

  if (!boatLocation) return false;

  const location = locations.find(l => l.name === boatLocation);
  return location?.type === 'shop' || location?.type === 'workshop';
};

export function ReportsView({ currentUser }) {
  const [unbilledData, setUnbilledData] = useState({ workOrders: [] });
  const [inventoryBoatsData, setInventoryBoatsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [daysBack, setDaysBack] = useState(7);
  const [expandedWOs, setExpandedWOs] = useState(new Set());

  // Modal state for clickable work orders and operations
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [selectedWOIdForOp, setSelectedWOIdForOp] = useState(null);

  // Weekly report state
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMonday(new Date()));
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [reportItems, setReportItems] = useState({});  // { workOrderId: { billing_status, notes } }
  const [reportNotes, setReportNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [notificationStatus, setNotificationStatus] = useState(null); // { success: boolean, message: string }

  const currentWeekEnd = getSunday(currentWeekStart);

  // Load weekly report for selected week
  const loadWeeklyReport = useCallback(async () => {
    try {
      const weekStartStr = formatDateForDB(currentWeekStart);

      const { data: report, error: reportError } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('week_start', weekStartStr)
        .single();

      if (reportError && reportError.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is ok
        console.error('Error loading weekly report:', reportError);
      }

      if (report) {
        setWeeklyReport(report);
        setReportNotes(report.notes || '');

        // Load report items
        const { data: items, error: itemsError } = await supabase
          .from('weekly_report_items')
          .select('*')
          .eq('report_id', report.id);

        if (itemsError) {
          console.error('Error loading report items:', itemsError);
        } else {
          const itemsMap = {};
          for (const item of (items || [])) {
            itemsMap[item.work_order_id] = {
              billing_status: item.billing_status,
              notes: item.notes || ''
            };
          }
          setReportItems(itemsMap);
        }
      } else {
        setWeeklyReport(null);
        setReportNotes('');
        setReportItems({});
      }
    } catch (err) {
      console.error('Error in loadWeeklyReport:', err);
    }
  }, [currentWeekStart]);

  useEffect(() => {
    loadUnbilledWork();
  }, [daysBack]);

  useEffect(() => {
    loadWeeklyReport();
  }, [loadWeeklyReport]);

  const loadUnbilledWork = async () => {
    setIsLoading(true);
    setError('');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      cutoffDate.setHours(0, 0, 0, 0);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD format for work_date

      const { data: locations } = await supabase
        .from('locations')
        .select('id, name, type');

      const { data: inventoryBoats } = await supabase
        .from('inventory_boats')
        .select('id, dockmaster_id, location, name, year, make, model');

      // Store inventory boats for use in render (for rigging work order display)
      setInventoryBoatsData(inventoryBoats || []);

      // Query time_entries table directly for work performed within the date range
      let allTimeEntries = [];
      let offset = 0;
      const PAGE_SIZE = 1000;

      while (true) {
        const { data: pageEntries, error: teError } = await supabase
          .from('time_entries')
          .select('work_order_id, work_date, hours')
          .gte('work_date', cutoffDateStr)
          .gt('hours', 0)  // Only entries with actual hours worked
          .range(offset, offset + PAGE_SIZE - 1);

        if (teError) throw teError;
        if (!pageEntries || pageEntries.length === 0) break;

        allTimeEntries.push(...pageEntries);
        if (pageEntries.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      // Build map of work order IDs with their latest work date
      const woLastWorkedMap = new Map();
      for (const te of allTimeEntries) {
        const existing = woLastWorkedMap.get(te.work_order_id);
        if (!existing || te.work_date > existing) {
          woLastWorkedMap.set(te.work_order_id, te.work_date);
        }
      }

      const workOrderIds = [...woLastWorkedMap.keys()];

      if (workOrderIds.length === 0) {
        setUnbilledData({ workOrders: [] });
        setIsLoading(false);
        return;
      }

      const BATCH_SIZE = 500;
      const allWorkOrders = [];

      for (let i = 0; i < workOrderIds.length; i += BATCH_SIZE) {
        const batchIds = workOrderIds.slice(i, i + BATCH_SIZE);

        // Only filter by status = Open, no longer require total_labor_cost > 0
        // since we're using time_entries as the source of truth
        const { data: batchWOs, error: woError } = await supabase
          .from('work_orders')
          .select(`
            *,
            boat:boats(id, name, owner, dockmaster_id, work_order_number, location)
          `)
          .in('id', batchIds)
          .eq('status', 'O');

        if (woError) throw woError;
        if (batchWOs) allWorkOrders.push(...batchWOs);
      }

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

      const opsByWO = new Map();
      for (const op of allOperations) {
        if (!opsByWO.has(op.work_order_id)) {
          opsByWO.set(op.work_order_id, []);
        }
        opsByWO.get(op.work_order_id).push(op);
      }

      const workOrdersWithRecentLabor = allWorkOrders.map(wo => ({
        ...wo,
        operations: opsByWO.get(wo.id) || []
      }));

      const filteredWorkOrders = workOrdersWithRecentLabor.filter(wo => {
        return !isBoatInShop(wo, locations || [], inventoryBoats || []);
      });

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

  // Navigate weeks
  const goToPreviousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getMonday(new Date()));
  };

  // Update report item (billing status or notes)
  const updateReportItem = (workOrderId, field, value) => {
    setReportItems(prev => ({
      ...prev,
      [workOrderId]: {
        ...prev[workOrderId],
        [field]: value
      }
    }));
  };

  // Save report as draft
  const saveReport = async (status = 'draft') => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      const weekStartStr = formatDateForDB(currentWeekStart);
      const weekEndStr = formatDateForDB(currentWeekEnd);
      const totalWOs = unbilledData.workOrders.length;
      const totalCharges = unbilledData.workOrders.reduce((sum, wo) => sum + (wo.total_charges || 0), 0);

      let reportId = weeklyReport?.id;

      if (reportId) {
        // Update existing report
        const updateData = {
          notes: reportNotes,
          total_work_orders: totalWOs,
          total_charges: totalCharges,
          status,
        };

        if (status === 'submitted' && weeklyReport.status !== 'submitted') {
          updateData.submitted_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
          .from('weekly_reports')
          .update(updateData)
          .eq('id', reportId);

        if (updateError) throw updateError;
      } else {
        // Create new report
        const { data: newReport, error: createError } = await supabase
          .from('weekly_reports')
          .insert({
            week_start: weekStartStr,
            week_end: weekEndStr,
            created_by: currentUser?.id,
            notes: reportNotes,
            total_work_orders: totalWOs,
            total_charges: totalCharges,
            status,
            submitted_at: status === 'submitted' ? new Date().toISOString() : null,
          })
          .select()
          .single();

        if (createError) throw createError;
        reportId = newReport.id;
      }

      // Save/update report items
      for (const [woId, item] of Object.entries(reportItems)) {
        if (item.billing_status || item.notes) {
          const { error: itemError } = await supabase
            .from('weekly_report_items')
            .upsert({
              report_id: reportId,
              work_order_id: parseInt(woId),
              billing_status: item.billing_status || 'pending',
              notes: item.notes || '',
            }, {
              onConflict: 'report_id,work_order_id'
            });

          if (itemError) {
            console.error('Error saving report item:', itemError);
          }
        }
      }

      // If submitting, send notification to managers
      let emailStatus = null;
      if (status === 'submitted') {
        try {
          // Get current session to ensure auth header is included
          const { data: { session } } = await supabase.auth.getSession();

          const { data: notifyData, error: notifyError } = await supabase.functions.invoke('notify-report-submitted', {
            body: { reportId },
            headers: session?.access_token ? {
              Authorization: `Bearer ${session.access_token}`
            } : undefined
          });
          if (notifyError) {
            console.error('Email notification error:', notifyError);
            // Provide helpful message based on error type
            let errorMessage = 'Failed to send notification';
            if (notifyError.message?.includes('401') || notifyError.status === 401) {
              errorMessage = 'Auth error - Edge Function needs redeployment (run: supabase functions deploy notify-report-submitted)';
            } else if (notifyError.message) {
              errorMessage = notifyError.message;
            }
            emailStatus = { success: false, message: errorMessage };
          } else if (notifyData && !notifyData.emailSent) {
            console.warn('Email not sent:', notifyData.message || 'Unknown reason');
            emailStatus = { success: false, message: notifyData.message || 'Email not sent (check API key or manager emails)' };
          } else if (notifyData?.emailSent) {
            emailStatus = { success: true, message: `Email sent to ${notifyData.recipients || 0} manager(s)` };
          }
        } catch (notifyErr) {
          console.error('Failed to send notification:', notifyErr);
          let errorMessage = 'Failed to invoke notification function';
          if (notifyErr.message?.includes('401')) {
            errorMessage = 'Auth error - try logging out and back in, or redeploy Edge Function';
          }
          emailStatus = { success: false, message: errorMessage };
        }
        setNotificationStatus(emailStatus);
      }

      // Reload the report
      await loadWeeklyReport();
      setSaveMessage(status === 'submitted' ? 'Report submitted!' : 'Draft saved!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('Error saving report:', err);
      setSaveMessage('Error saving report');
    } finally {
      setIsSaving(false);
    }
  };

  // Undo submit - revert report back to draft status
  const undoSubmit = async () => {
    if (!weeklyReport?.id) return;

    setIsSaving(true);
    setSaveMessage('');
    setNotificationStatus(null);

    try {
      const { error: updateError } = await supabase
        .from('weekly_reports')
        .update({
          status: 'draft',
          submitted_at: null,
        })
        .eq('id', weeklyReport.id);

      if (updateError) throw updateError;

      await loadWeeklyReport();
      setSaveMessage('Report reverted to draft - you can now edit and resubmit');
      setTimeout(() => setSaveMessage(''), 4000);
    } catch (err) {
      console.error('Error reverting report:', err);
      setSaveMessage('Error reverting report to draft');
    } finally {
      setIsSaving(false);
    }
  };

  // Print handler
  const handlePrint = () => {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'print-styles';
    styleSheet.textContent = printStyles;
    document.head.appendChild(styleSheet);

    window.print();

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

  // Status badge component
  const StatusBadge = ({ status }) => {
    const configs = {
      draft: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock, label: 'Draft' },
      submitted: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Send, label: 'Submitted' },
      approved: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle, label: 'Approved' },
    };
    const config = configs[status] || configs.draft;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
        <Icon className="w-4 h-4" />
        {config.label}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Weekly Reports</h1>
        <p className="text-slate-600">Track unbilled work orders and submit weekly billing reports</p>
      </div>

      {/* Weekly Report Status Banner */}
      <div className="mb-6 bg-white rounded-xl shadow-md border border-slate-200 p-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Week Navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={goToPreviousWeek}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="Previous week"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="text-center">
              <p className="text-sm text-slate-500">Week of</p>
              <p className="font-semibold text-slate-900">
                {formatWeekRange(currentWeekStart, currentWeekEnd)}
              </p>
            </div>
            <button
              onClick={goToNextWeek}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="Next week"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
            <button
              onClick={goToCurrentWeek}
              className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Today
            </button>
          </div>

          {/* Report Status */}
          <div className="flex items-center gap-4">
            {weeklyReport ? (
              <StatusBadge status={weeklyReport.status} />
            ) : (
              <span className="text-sm text-slate-500">No report yet</span>
            )}

            {weeklyReport?.submitted_at && (
              <span className="text-xs text-slate-500">
                Submitted: {new Date(weeklyReport.submitted_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => saveReport('draft')}
              disabled={isSaving || weeklyReport?.status === 'approved'}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              Save Draft
            </button>
            <button
              onClick={() => saveReport('submitted')}
              disabled={isSaving || weeklyReport?.status === 'approved' || weeklyReport?.status === 'submitted'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              Submit Report
            </button>
            {weeklyReport?.status === 'submitted' && (
              <button
                onClick={undoSubmit}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Revert to draft to make changes and resubmit"
              >
                <Undo2 className="w-4 h-4" />
                Undo Submit
              </button>
            )}
          </div>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className={`mt-3 text-sm font-medium ${saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {saveMessage}
          </div>
        )}

        {/* Email Notification Status */}
        {notificationStatus && (
          <div className={`mt-2 text-sm flex items-center gap-2 ${notificationStatus.success ? 'text-green-600' : 'text-amber-600'}`}>
            {notificationStatus.success ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span>{notificationStatus.message}</span>
          </div>
        )}

        {/* Report Notes */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Weekly Notes / Summary
          </label>
          <textarea
            value={reportNotes}
            onChange={(e) => setReportNotes(e.target.value)}
            placeholder="Add notes about this week's billing review..."
            rows={3}
            disabled={weeklyReport?.status === 'approved'}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mb-6 flex items-center gap-4 no-print">
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
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Refresh
        </button>
        <button
          onClick={handlePrint}
          disabled={unbilledData.workOrders.length === 0}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          Week: {formatWeekRange(currentWeekStart, currentWeekEnd)} |
          Generated: {new Date().toLocaleDateString()} |
          Total: {totalWorkOrders} work orders | ${totalCharges.toFixed(2)} unbilled
        </p>
        {reportNotes && (
          <div className="mt-2 p-2 bg-gray-100 rounded">
            <p className="text-sm font-medium">Notes:</p>
            <p className="text-sm">{reportNotes}</p>
          </div>
        )}
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
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Charges
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Last Labor
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider no-print">
                  Operations
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider" style={{ minWidth: '120px' }}>
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider no-print" style={{ minWidth: '200px' }}>
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {unbilledData.workOrders.map((wo) => {
                const isExpanded = expandedWOs.has(wo.id);
                const operations = wo.operations || [];
                const item = reportItems[wo.id] || {};

                // Determine boat name with proper fallbacks for customer vs inventory boats
                let boatName = 'Unknown Boat';
                let ownerName = 'Unknown Owner';

                if (wo.boat?.name) {
                  // Customer boat from joined table
                  boatName = wo.boat.name;
                  ownerName = wo.boat.owner || wo.customer_name || 'Unknown Owner';
                } else if (wo.rigging_id) {
                  // Inventory/rigging boat - lookup by rigging_id
                  const invBoat = inventoryBoatsData.find(b => b.dockmaster_id === wo.rigging_id);
                  if (invBoat?.name) {
                    boatName = invBoat.name;
                    ownerName = 'BBG Inventory';
                  } else {
                    // Fallback to work order fields
                    boatName = wo.boat_name || 'Unknown Boat';
                    ownerName = 'BBG Inventory';
                  }
                } else {
                  // No boat join and no rigging_id - use work order fields
                  boatName = wo.boat_name || 'Unknown Boat';
                  ownerName = wo.customer_name || 'Unknown Owner';
                }

                return (
                  <React.Fragment key={wo.id}>
                    {/* Work Order Row */}
                    <tr
                      className="hover:bg-slate-50 transition-colors print-row"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleWorkOrder(wo.id)}
                            className="p-1 hover:bg-slate-200 rounded no-print"
                          >
                            <svg
                              className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedWorkOrder(wo);
                            }}
                            className="font-mono font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {wo.id}
                          </button>
                        </div>
                        {wo.title && (
                          <p className="text-xs text-slate-600 mt-1 ml-7 print:ml-0">{wo.title}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{boatName}</p>
                        <p className="text-sm text-slate-600">{ownerName}</p>
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
                      {/* Billing Status Dropdown */}
                      <td className="px-4 py-3">
                        <select
                          value={item.billing_status || 'pending'}
                          onChange={(e) => updateReportItem(wo.id, 'billing_status', e.target.value)}
                          disabled={weeklyReport?.status === 'approved'}
                          className={`w-full px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed ${
                            item.billing_status === 'billed'
                              ? 'bg-green-50 border-green-300 text-green-800'
                              : item.billing_status === 'not_billed'
                              ? 'bg-red-50 border-red-300 text-red-800'
                              : 'bg-yellow-50 border-yellow-300 text-yellow-800'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="billed">Billed</option>
                          <option value="not_billed">Not Billed</option>
                        </select>
                      </td>
                      {/* Notes Input */}
                      <td className="px-4 py-3 no-print">
                        <input
                          type="text"
                          value={item.notes || ''}
                          onChange={(e) => updateReportItem(wo.id, 'notes', e.target.value)}
                          placeholder="Add note..."
                          disabled={weeklyReport?.status === 'approved'}
                          className="w-full px-2 py-1 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>

                    {/* Expanded Operations - hidden when printing */}
                    {isExpanded && operations.length > 0 && (
                      <tr className="no-print">
                        <td colSpan={7} className="px-4 py-2 bg-slate-50">
                          <div className="pl-7">
                            <p className="text-xs font-semibold text-slate-700 uppercase mb-2">Operations</p>
                            <div className="space-y-1">
                              {operations.map((op, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => {
                                    setSelectedOperation(op);
                                    setSelectedWOIdForOp(wo.id);
                                  }}
                                  className="flex items-center justify-between p-2 bg-white rounded border border-slate-200 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs font-semibold text-blue-600 hover:text-blue-800">
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

      {/* Work Order Details Modal */}
      {selectedWorkOrder && (
        <WorkOrdersModal
          workOrders={[{
            ...selectedWorkOrder,
            totalCharges: selectedWorkOrder.total_charges,
            creationDate: selectedWorkOrder.creation_date,
            operations: (selectedWorkOrder.operations || []).map(op => ({
              ...op,
              opcodeDesc: op.opcode_desc,
              totalCharges: op.total_charges,
              flagLaborFinished: op.flag_labor_finished,
            }))
          }]}
          boatName={selectedWorkOrder.boat?.name ||
            (selectedWorkOrder.rigging_id
              ? inventoryBoatsData.find(b => b.dockmaster_id === selectedWorkOrder.rigging_id)?.name
              : null) ||
            selectedWorkOrder.boat_name ||
            'Unknown Boat'}
          boatOwner={selectedWorkOrder.boat?.owner ||
            (selectedWorkOrder.rigging_id ? 'BBG Inventory' : null) ||
            selectedWorkOrder.customer_name ||
            ''}
          onClose={() => setSelectedWorkOrder(null)}
          variant="customer"
        />
      )}

      {/* Operation Details Modal */}
      {selectedOperation && (
        <OperationDetailsModal
          operation={selectedOperation}
          workOrderId={selectedWOIdForOp}
          onClose={() => {
            setSelectedOperation(null);
            setSelectedWOIdForOp(null);
          }}
        />
      )}
    </div>
  );
}
