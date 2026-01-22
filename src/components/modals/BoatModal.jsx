import React, { useState } from 'react';
import { X } from 'lucide-react';

export function BoatModal({ boat, locations, onSave, onCancel }) {
  // ====================================================================
  // PRODUCTION TODO: ADD YEAR FIELD TO CUSTOMER BOATS
  // ====================================================================
  // When converting to full app, add 'year' field to this form:
  // 1. Add to formData initial state (above)
  // 2. Add input field in form (below, after model field)
  // 3. Add to boat creation in BoatsView
  // 4. This allows customer boats to also be filtered by year
  // 5. Store in database: bbg:boats collection
  // Example field:
  //   <div>
  //     <label className="block text-sm font-medium text-slate-700 mb-1">
  //       Year
  //     </label>
  //     <input
  //       type="number"
  //       value={formData.year || ''}
  //       onChange={(e) => setFormData({...formData, year: parseInt(e.target.value)})}
  //       className="w-full px-3 py-2 border border-slate-300 rounded-lg"
  //       placeholder="2024"
  //       min="1900"
  //       max="2099"
  //     />
  //   </div>
  // ====================================================================

  const [formData, setFormData] = useState(boat || {
    name: '',
    model: '',
    owner: '',
    status: 'needs-approval',
    location: '',
    slot: '',
    workOrderNumber: '',
    mechanicalsComplete: false,
    cleanComplete: false,
    fiberglassComplete: false,
    warrantyComplete: false
  });

  const allWorkPhasesComplete = formData.mechanicalsComplete && formData.cleanComplete && formData.fiberglassComplete && formData.warrantyComplete;

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate: can't set to complete without all phases done
    if (formData.status === 'all-work-complete' && !allWorkPhasesComplete) {
      alert('Cannot mark as complete! All work phases (Mechanicals, Clean, Fiberglass, Warranty) must be completed first.');
      return;
    }

    onSave(formData);
  };

  const handleStatusChange = (newStatus) => {
    if (newStatus === 'all-work-complete' && !allWorkPhasesComplete) {
      alert('Cannot mark as complete! All work phases (Mechanicals, Clean, Fiberglass) must be completed first.');
      return;
    }
    setFormData({ ...formData, status: newStatus });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">{boat ? 'Edit Boat' : 'Add New Boat'}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Boat Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Sea Ray Sundancer"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Model</label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 320 Sundancer"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Owner</label>
            <input
              type="text"
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Owner name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Work Order Number</label>
            <input
              type="text"
              value={formData.workOrderNumber || ''}
              onChange={(e) => setFormData({ ...formData, workOrderNumber: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., WO-12345"
            />
            <p className="text-xs text-slate-500 mt-1">Optional: Track work order associated with this boat</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="needs-approval">Needs Approval</option>
              <option value="needs-parts">Needs Parts</option>
              <option value="parts-kit-pulled">Parts Kit Pulled</option>
              <option value="on-deck">On Deck</option>
              <option value="all-work-complete" disabled={!allWorkPhasesComplete}>
                All Work Complete {!allWorkPhasesComplete ? '(requires all phases)' : ''}
              </option>
            </select>
            {!allWorkPhasesComplete && (
              <p className="text-xs text-orange-600 mt-1">
                Complete all work phases to enable "All Work Complete" status
              </p>
            )}
          </div>

          {/* Work Phase Checkboxes */}
          <div className="border-t border-slate-200 pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Work Phases</label>
            <p className="text-xs text-slate-500 mb-3">Check phases that are complete or not needed. All phases must be verified and billed before marking status as complete.</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.mechanicalsComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, mechanicalsComplete: e.target.checked };
                    // Auto-downgrade status if unchecking and currently complete
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Mechanicals Complete</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.cleanComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, cleanComplete: e.target.checked };
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Clean Complete</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.fiberglassComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, fiberglassComplete: e.target.checked };
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Fiberglass Complete</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.warrantyComplete || false}
                  onChange={(e) => {
                    const newData = { ...formData, warrantyComplete: e.target.checked };
                    if (!e.target.checked && formData.status === 'all-work-complete') {
                      newData.status = 'on-deck';
                    }
                    setFormData(newData);
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Warranty Complete</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              {boat ? 'Save Changes' : 'Add Boat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
