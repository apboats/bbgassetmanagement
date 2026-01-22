import React, { useState, useEffect } from 'react';
import { Camera, Package, Settings, Menu, Home, Map, User, LogOut, Anchor } from 'lucide-react';

// Import pages
import { LoginScreen } from './pages/LoginScreen';
import { DashboardView } from './pages/DashboardView';
import { BoatsView } from './pages/BoatsView';
import { LocationsView } from './pages/LocationsView';
import { ScanView } from './pages/ScanView';
import { MyViewEditor } from './pages/MyViewEditor';
import { InventoryView } from './pages/InventoryView';
import { SettingsView } from './pages/SettingsView';
import { BoatShowPlanner } from './pages/BoatShowPlanner';

// Import shared components
import { NavButton } from './components/SharedComponents';

// Touch drag polyfill - makes draggable work on touch devices
if (typeof window !== 'undefined') {
  let draggedElement = null;
  
  const handleTouchStart = (e) => {
    const target = e.target.closest('[draggable="true"]');
    if (target && !target.classList.contains('customizer-drag')) {
      draggedElement = target;
      target.style.opacity = '0.5';
      const event = new Event('dragstart', { bubbles: true });
      target.dispatchEvent(event);
    }
  };
  
  const handleTouchMove = (e) => {
    if (!draggedElement) return;
    e.preventDefault();
  };
  
  const handleTouchEnd = (e) => {
    if (!draggedElement) return;
    draggedElement.style.opacity = '';
    const touch = e.changedTouches[0];
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    const dropTarget = elementBelow?.closest('.location-slot');
    
    if (dropTarget && dropTarget !== draggedElement) {
      const dropEvent = new Event('drop', { bubbles: true });
      dropTarget.dispatchEvent(dropEvent);
    }
    
    const dragendEvent = new Event('dragend', { bubbles: true });
    draggedElement.dispatchEvent(dragendEvent);
    draggedElement = null;
  };
  
  document.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd);
}

// Main App Component
export default function BoatsByGeorgeAssetManager({
  // User
  currentUser,
  onSignOut,
  
  // Boats
  boats = [],
  onAddBoat,
  onUpdateBoat,
  onDeleteBoat,
  onAssignNfcTag,
  onReleaseNfcTag,
  
  // Inventory Boats
  inventoryBoats = [],
  onUpdateInventoryBoat,
  onSyncInventory,
  onSyncInternalWorkOrders,
  lastInventorySync,
  
  // Locations
  locations = [],
  onAddLocation,
  onUpdateLocation,
  onDeleteLocation,
  onAssignBoatToSlot,
  onRemoveBoatFromSlot,
  onMoveBoat,

  // Sites
  sites = [],
  onAddSite,
  onUpdateSite,
  onDeleteSite,
  onReorderSites,

  // User Preferences
  userPreferences = {},
  onSavePreferences,
  
  // Users
  users = [],
  onReloadUsers,
  
  // Dockmaster Config
  dockmasterConfig,
  onSaveDockmasterConfig,
}) {
  // UI State
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Wrapper functions for array-based updates
  const saveBoats = async (newBoats) => {
    const added = newBoats.filter(nb => !boats.find(b => b.id === nb.id));
    const removed = boats.filter(b => !newBoats.find(nb => nb.id === b.id));
    const updated = newBoats.filter(nb => {
      const oldBoat = boats.find(b => b.id === nb.id);
      return oldBoat && JSON.stringify(oldBoat) !== JSON.stringify(nb);
    });
    
    for (const boat of added) await onAddBoat(boat);
    for (const boat of removed) await onDeleteBoat(boat.id);
    for (const boat of updated) {
      const oldBoat = boats.find(b => b.id === boat.id);
      const changes = {};
      for (const key in boat) {
        if (JSON.stringify(boat[key]) !== JSON.stringify(oldBoat?.[key])) {
          changes[key] = boat[key];
        }
      }
      if (Object.keys(changes).length > 0) await onUpdateBoat(boat.id, changes);
    }
  };

  const saveLocations = async (newLocations) => {
    const added = newLocations.filter(nl => !locations.find(l => l.id === nl.id));
    const removed = locations.filter(l => !newLocations.find(nl => nl.id === l.id));
    const updated = newLocations.filter(nl => {
      const oldLoc = locations.find(l => l.id === nl.id);
      return oldLoc && JSON.stringify(oldLoc) !== JSON.stringify(nl);
    });
    
    for (const loc of added) await onAddLocation(loc);
    for (const loc of removed) await onDeleteLocation(loc.id);
    for (const loc of updated) {
      const oldLoc = locations.find(l => l.id === loc.id);
      const changes = {};
      for (const key in loc) {
        if (JSON.stringify(loc[key]) !== JSON.stringify(oldLoc?.[key])) {
          changes[key] = loc[key];
        }
      }
      if (Object.keys(changes).length > 0) await onUpdateLocation(loc.id, changes);
    }
  };

  const saveInventoryBoats = async (newInventoryBoats, changedBoatId = null) => {
    if (changedBoatId) {
      const changedBoat = newInventoryBoats.find(b => b.id === changedBoatId);
      if (changedBoat) await onUpdateInventoryBoat(changedBoat.id, changedBoat);
      return;
    }
    
    for (const newBoat of newInventoryBoats) {
      const oldBoat = inventoryBoats.find(b => b.id === newBoat.id);
      if (oldBoat && JSON.stringify(oldBoat) !== JSON.stringify(newBoat)) {
        await onUpdateInventoryBoat(newBoat.id, newBoat);
      }
    }
  };

  const saveUserPreferences = async (userId, preferences) => {
    try {
      await onSavePreferences(preferences);
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  };

  const syncInventoryBoats = async (fullSync = false) => {
    if (!dockmasterConfig || !dockmasterConfig.username || !dockmasterConfig.password) {
      console.log('Dockmaster credentials not configured. Skipping inventory sync.');
      return;
    }
    try {
      const result = await onSyncInventory(fullSync);
      console.log(`Inventory sync completed. ${result?.count || 0} boats synced.`);
    } catch (error) {
      console.error('Error syncing inventory boats:', error);
    }
  };

  const syncInternalWorkOrders = async (fullSync = false) => {
    if (!dockmasterConfig || !dockmasterConfig.username || !dockmasterConfig.password) {
      return;
    }
    try {
      const result = await onSyncInternalWorkOrders(fullSync);
      console.log('Internal work orders sync completed:', result);
    } catch (error) {
      console.error('Error syncing internal work orders:', error);
    }
  };

  // Set up sync interval
  useEffect(() => {
    if (!dockmasterConfig?.username || !dockmasterConfig?.password) return;
    
    syncInventoryBoats(false);
    const syncInterval = setInterval(() => syncInventoryBoats(false), 1800000);
    return () => clearInterval(syncInterval);
  }, []);

  const handleLogin = (user) => {
    setIsAuthenticated(true);
    setCurrentView('dashboard');
  };

  const handleLogout = async () => {
    setIsAuthenticated(false);
    await onSignOut();
    setCurrentView('dashboard');
    setShowMobileMenu(false);
  };

  if (!isAuthenticated) {
    return <LoginScreen users={users} onLogin={handleLogin} />;
  }

  // Combine boats for views that need both
  const getCombinedBoats = () => {
    const seen = {};
    const combined = [];
    boats.forEach(boat => { if (!seen[boat.id]) { seen[boat.id] = true; combined.push(boat); } });
    inventoryBoats.forEach(boat => {
      if (!seen[boat.id]) { seen[boat.id] = true; combined.push(boat); }
      else { const index = combined.findIndex(b => b.id === boat.id); if (index !== -1) combined[index] = boat; }
    });
    return combined;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
        * { font-family: 'Inter', sans-serif; }
        h1, h2, h3, h4, h5, h6 { font-family: 'Archivo', sans-serif; }
        .boat-card { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
        .boat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(15, 23, 42, 0.15); }
        .location-slot { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
        .location-slot:not([draggable="true"]):hover { background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.3); }
        .location-slot[draggable="true"]:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
        .location-slot[draggable="true"] { cursor: grab; user-select: none; }
        .location-slot[draggable="true"]:active { cursor: grabbing; }
        .dragging { opacity: 0.4; transform: scale(0.95); }
        .drag-over { border-color: #3b82f6 !important; background: rgba(59, 130, 246, 0.15) !important; transform: scale(1.02); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3); }
        .unassigned-boat { user-select: none; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
        .unassigned-boat:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); }
        .unassigned-boat:active { transform: scale(0.98); }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-in { animation: slideIn 0.3s ease-out; }
        .status-needs-approval { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .status-needs-parts { background: linear-gradient(135deg, #eab308, #ca8a04); }
        .status-parts-kit-pulled { background: linear-gradient(135deg, #f97316, #ea580c); }
        .status-on-deck { background: linear-gradient(135deg, #3b82f6, #2563eb); }
        .status-all-work-complete { background: linear-gradient(135deg, #10b981, #059669); }
        .status-archived { background: linear-gradient(135deg, #6b7280, #4b5563); }
      `}</style>

      {/* Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 lg:h-16">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <img src="/images/favicon.png" alt="Boats by George" className="w-8 h-8 lg:w-10 lg:h-10 object-contain flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
              <div className="w-8 h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center flex-shrink-0" style={{display: 'none'}}>
                <Package className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
              </div>
              <div className="hidden lg:block">
                <h1 className="text-xl font-bold text-slate-900">Boats By George</h1>
                <p className="text-xs text-slate-500">Asset Management System</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-2">
              <NavButton icon={Home} label="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
              <NavButton icon={User} label="My View" active={currentView === 'myview'} onClick={() => setCurrentView('myview')} />
              <NavButton icon={Map} label="Locations" active={currentView === 'locations'} onClick={() => setCurrentView('locations')} />
              <NavButton icon={Package} label="Boats" active={currentView === 'boats'} onClick={() => setCurrentView('boats')} />
              <NavButton icon={Package} label="Inventory" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />
              <NavButton icon={Anchor} label="Shows" active={currentView === 'shows'} onClick={() => setCurrentView('shows')} />
              <NavButton icon={Camera} label="Scan" active={currentView === 'scan'} onClick={() => setCurrentView('scan')} />
              <NavButton icon={Settings} label="Settings" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
              <div className="flex items-center ml-2 pl-2 border-l border-slate-200">
                <button onClick={handleLogout} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Logout">
                  <LogOut className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex lg:hidden items-center gap-2">
              <button onClick={handleLogout} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Logout">
                <LogOut className="w-4 h-4 lg:w-5 lg:h-5 text-slate-600" />
              </button>
              <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Menu">
                <Menu className="w-5 h-5 lg:w-6 lg:h-6 text-slate-600" />
              </button>
            </div>
          </div>

          {/* Mobile Navigation Menu */}
          {showMobileMenu && (
            <div className="lg:hidden border-t border-slate-200 py-2 bg-white">
              <div className="flex flex-col gap-1">
                {[
                  { view: 'dashboard', icon: Home, label: 'Dashboard' },
                  { view: 'myview', icon: User, label: 'My View' },
                  { view: 'locations', icon: Map, label: 'Locations' },
                  { view: 'boats', icon: Package, label: 'Boats' },
                  { view: 'inventory', icon: Package, label: 'Inventory' },
                  { view: 'shows', icon: Anchor, label: 'Shows' },
                  { view: 'scan', icon: Camera, label: 'Scan' },
                  { view: 'settings', icon: Settings, label: 'Settings' },
                ].map(({ view, icon: Icon, label }) => (
                  <button key={view} onClick={() => { setCurrentView(view); setShowMobileMenu(false); }}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${currentView === view ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <Icon className="w-5 h-5" /><span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && (
          <DashboardView boats={boats} locations={locations} sites={sites} onNavigate={setCurrentView} onUpdateBoats={saveBoats} onUpdateLocations={saveLocations} onMoveBoat={onMoveBoat} currentUser={currentUser} />
        )}
        {currentView === 'locations' && (
          <LocationsView locations={locations} sites={sites} boats={getCombinedBoats()} onUpdateLocations={saveLocations}
            onUpdateBoats={(updatedBoats) => { saveBoats(updatedBoats.filter(b => !b.isInventory)); saveInventoryBoats(updatedBoats.filter(b => b.isInventory)); }}
            onMoveBoat={onMoveBoat} onAddSite={onAddSite} onUpdateSite={onUpdateSite} onDeleteSite={onDeleteSite} onReorderSites={onReorderSites} currentUser={currentUser} />
        )}
        {currentView === 'boats' && (
          <BoatsView boats={boats} locations={locations} sites={sites} onUpdateBoats={saveBoats} onMoveBoat={onMoveBoat} dockmasterConfig={dockmasterConfig} />
        )}
        {currentView === 'scan' && (
          <ScanView boats={boats} locations={locations} onUpdateBoats={saveBoats} onUpdateLocations={saveLocations} />
        )}
        {currentView === 'myview' && (
          <MyViewEditor locations={locations} sites={sites} boats={getCombinedBoats()} userPreferences={userPreferences} currentUser={currentUser}
            onSavePreferences={(prefs) => saveUserPreferences(currentUser?.id || currentUser?.username || 'default-user', prefs)} onUpdateLocations={saveLocations}
            onUpdateBoats={(updatedBoats) => { saveBoats(updatedBoats.filter(b => !b.isInventory)); saveInventoryBoats(updatedBoats.filter(b => b.isInventory)); }} onMoveBoat={onMoveBoat} />
        )}
        {currentView === 'inventory' && (
          <InventoryView inventoryBoats={inventoryBoats} boats={boats} locations={locations} sites={sites} lastSync={lastInventorySync}
            onSyncNow={syncInventoryBoats} onSyncRiggingWOs={syncInternalWorkOrders} onUpdateInventoryBoats={saveInventoryBoats}
            onUpdateSingleBoat={onUpdateInventoryBoat} onMoveBoat={onMoveBoat} dockmasterConfig={dockmasterConfig} />
        )}
        {currentView === 'shows' && (
          <BoatShowPlanner inventoryBoats={inventoryBoats} />
        )}
        {currentView === 'settings' && (
          <SettingsView dockmasterConfig={dockmasterConfig} currentUser={currentUser} users={users}
            onSaveConfig={onSaveDockmasterConfig} onUpdateUsers={() => console.log('User updates handled by auth system')} onReloadUsers={onReloadUsers} />
        )}
      </div>
    </div>
  );
}
