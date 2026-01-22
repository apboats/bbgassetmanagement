import React, { useState } from 'react';
import { X } from 'lucide-react';

export function EditLocationModal({ location, sites = [], onSave, onCancel }) {
  const [formData, setFormData] = useState(location || {
    name: '',
    type: 'rack-building',
    layout: 'grid',
    rows: 4,
    columns: 8
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    // Clean up the data before saving
    const dataToSave = {
      name: formData.name,
      type: formData.type,
      layout: formData.type === 'pool' ? 'grid' : (formData.layout || 'grid'),
      rows: formData.type === 'pool' ? 1 : formData.rows,
      columns: formData.type === 'pool' ? 1 : formData.columns,
      site_id: formData.site_id || null,
    };

    // Preserve id if editing existing location
    if (formData.id) {
      dataToSave.id = formData.id;
    }

    // Preserve boats data if it exists
    if (formData.boats) {
      dataToSave.boats = formData.boats;
    }

    onSave(dataToSave);
  };

  const totalSlots = formData.layout === 'u-shaped'
    ? (formData.rows * 2) + formData.columns
    : formData.rows * formData.columns;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">{location ? 'Edit Location' : 'Add New Location'}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Location Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Rack Building A"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Site</label>
            <select
              value={formData.site_id || ''}
              onChange={(e) => setFormData({ ...formData, site_id: e.target.value || null })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Unassigned</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Group this location under a physical site (optional)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <select
              value={formData.type}
              onChange={(e) => {
                const newType = e.target.value;
                setFormData({
                  ...formData,
                  type: newType
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="rack-building">Rack Building</option>
              <option value="parking-lot">Parking Lot</option>
              <option value="shop">Shop</option>
              <option value="pool">Pool (No Grid)</option>
            </select>
            {formData.type === 'pool' && (
              <p className="text-xs text-slate-500 mt-1">
                A flexible container for boats without assigned slots. Great for boat shows, transit, or temporary staging.
              </p>
            )}
          </div>

          {formData.type !== 'pool' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Layout Style</label>
                <select
                  value={formData.layout || 'grid'}
                  onChange={(e) => setFormData({ ...formData, layout: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="grid">Grid (Full)</option>
                  <option value="u-shaped">U-Shaped (Perimeter)</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {formData.layout === 'u-shaped'
                    ? 'Boats placed along three edges (left, right, bottom)'
                    : 'Boats fill entire rectangular area'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {formData.layout === 'u-shaped' ? 'Unit Depth' : 'Rows'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={formData.rows}
                    onChange={(e) => setFormData({ ...formData, rows: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {formData.layout === 'u-shaped' && (
                    <p className="text-xs text-slate-500 mt-1">Height of U</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {formData.layout === 'u-shaped' ? 'Unit Width' : 'Columns'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={formData.columns}
                    onChange={(e) => setFormData({ ...formData, columns: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  {formData.layout === 'u-shaped' && (
                    <p className="text-xs text-slate-500 mt-1">Width of U</p>
                  )}
                </div>
              </div>

              {/* Preview */}
              <div className="border-2 border-slate-200 rounded-lg p-3 bg-slate-50">
                <p className="text-xs font-medium text-slate-700 mb-2">Preview:</p>
                <div className="text-xs text-slate-600 space-y-1">
                  {formData.layout === 'u-shaped' ? (
                    <>
                      <p>• Left side: {formData.rows} slots</p>
                      <p>• Bottom: {formData.columns} slots</p>
                      <p>• Right side: {formData.rows} slots</p>
                      <p className="font-semibold mt-2 pt-2 border-t border-slate-300">Total: {totalSlots} slots</p>
                    </>
                  ) : (
                    <>
                      <p>• Grid: {formData.rows} rows × {formData.columns} columns</p>
                      <p className="font-semibold mt-2 pt-2 border-t border-slate-300">Total: {totalSlots} slots</p>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

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
              {location ? 'Save Changes' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
