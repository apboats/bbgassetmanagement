import React, { useState } from 'react';
import { X, Building2, Edit2, Trash2, Plus } from 'lucide-react';

export function SiteManagementModal({ sites, locations, onAddSite, onUpdateSite, onDeleteSite, onClose }) {
  const [editingSiteId, setEditingSiteId] = useState(null);
  const [editingSiteName, setEditingSiteName] = useState('');
  const [isAddingNewSite, setIsAddingNewSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [error, setError] = useState('');

  // Count locations assigned to each site
  const getLocationCount = (siteId) => {
    return locations.filter(loc => loc.site_id === siteId).length;
  };

  const handleStartEdit = (site) => {
    setEditingSiteId(site.id);
    setEditingSiteName(site.name);
    setError('');
  };

  const handleSaveEdit = async () => {
    if (!editingSiteName.trim()) {
      setError('Site name cannot be empty');
      return;
    }

    try {
      await onUpdateSite(editingSiteId, { name: editingSiteName.trim() });
      setEditingSiteId(null);
      setEditingSiteName('');
      setError('');
    } catch (err) {
      setError('Failed to update site: ' + err.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingSiteId(null);
    setEditingSiteName('');
    setError('');
  };

  const handleDelete = async (site) => {
    const locationCount = getLocationCount(site.id);

    if (locationCount > 0) {
      setError(`Cannot delete "${site.name}" because it has ${locationCount} location${locationCount === 1 ? '' : 's'} assigned to it. Please reassign or delete those locations first.`);
      return;
    }

    if (confirm(`Are you sure you want to delete the site "${site.name}"?`)) {
      try {
        await onDeleteSite(site.id);
        setError('');
      } catch (err) {
        setError('Failed to delete site: ' + err.message);
      }
    }
  };

  const handleAddNewSite = async () => {
    if (!newSiteName.trim()) {
      setError('Site name cannot be empty');
      return;
    }

    try {
      // Get highest sort_order and add 1
      const maxSortOrder = sites.reduce((max, site) => Math.max(max, site.sort_order || 0), 0);

      await onAddSite({
        name: newSiteName.trim(),
        sort_order: maxSortOrder + 1
      });

      setIsAddingNewSite(false);
      setNewSiteName('');
      setError('');
    } catch (err) {
      setError('Failed to add site: ' + err.message);
    }
  };

  const handleCancelAdd = () => {
    setIsAddingNewSite(false);
    setNewSiteName('');
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Manage Sites</h2>
              <p className="text-sm text-slate-600">Organize locations by physical site</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Add Site Button */}
          {!isAddingNewSite && (
            <button
              onClick={() => setIsAddingNewSite(true)}
              className="w-full mb-4 p-4 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center gap-2 text-slate-600 hover:text-indigo-600"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">Add New Site</span>
            </button>
          )}

          {/* Add New Site Form */}
          {isAddingNewSite && (
            <div className="mb-4 p-4 bg-indigo-50 border-2 border-indigo-200 rounded-lg">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                New Site Name
              </label>
              <input
                type="text"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNewSite();
                  if (e.key === 'Escape') handleCancelAdd();
                }}
                placeholder="e.g., South Warehouse"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-3"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddNewSite}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                >
                  Add Site
                </button>
                <button
                  onClick={handleCancelAdd}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Sites List */}
          <div className="space-y-3">
            {sites.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No sites yet</p>
                <p className="text-sm">Add your first site to organize locations</p>
              </div>
            ) : (
              sites.map(site => {
                const locationCount = getLocationCount(site.id);
                const isEditing = editingSiteId === site.id;

                return (
                  <div
                    key={site.id}
                    className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                  >
                    {isEditing ? (
                      /* Edit Mode */
                      <div>
                        <input
                          type="text"
                          value={editingSiteName}
                          onChange={(e) => setEditingSiteName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-3"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                            <h3 className="font-semibold text-slate-900">{site.name}</h3>
                          </div>
                          <p className="text-sm text-slate-600 ml-4">
                            {locationCount} location{locationCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleStartEdit(site)}
                            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                            title="Edit site"
                          >
                            <Edit2 className="w-4 h-4 text-slate-600" />
                          </button>
                          <button
                            onClick={() => handleDelete(site)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                            title={locationCount > 0 ? 'Cannot delete - has locations' : 'Delete site'}
                          >
                            <Trash2 className={`w-4 h-4 ${locationCount > 0 ? 'text-slate-300' : 'text-red-600'}`} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SiteManagementModal;
