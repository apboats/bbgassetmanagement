import React, { useState, useEffect, useRef } from 'react';
import { Camera, Search, Plus, Trash2, Edit2, Save, X, LogOut, Users, Map, Package, Settings, Menu, Grid, ChevronRight, Home } from 'lucide-react';

// Main App Component
export default function BoatsByGeorgeAssetManager() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [boats, setBoats] = useState([]);
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [dockmasterConfig, setDockmasterConfig] = useState(null);
  const [dockmasterToken, setDockmasterToken] = useState(null);

  // Load data from storage on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const boatsData = await window.storage.get('bbg:boats');
      const locationsData = await window.storage.get('bbg:locations');
      const usersData = await window.storage.get('bbg:users');
      const dockmasterData = await window.storage.get('bbg:dockmaster');

      if (boatsData?.value) setBoats(JSON.parse(boatsData.value));
      if (locationsData?.value) setLocations(JSON.parse(locationsData.value));
      if (dockmasterData?.value) setDockmasterConfig(JSON.parse(dockmasterData.value));
      
      if (usersData?.value) {
        setUsers(JSON.parse(usersData.value));
      } else {
        // Initialize with default admin user
        const defaultUsers = [
          { id: '1', username: 'admin', password: 'admin', role: 'admin', name: 'Admin User' }
        ];
        setUsers(defaultUsers);
        await window.storage.set('bbg:users', JSON.stringify(defaultUsers));
      }

      // Initialize default locations if none exist
      if (!locationsData?.value) {
        const defaultLocations = [
          { id: 'rack-a', name: 'Rack Building A', type: 'rack', rows: 4, columns: 8, boats: {} },
          { id: 'rack-b', name: 'Rack Building B', type: 'rack', rows: 4, columns: 8, boats: {} },
          { id: 'parking', name: 'Outdoor Parking', type: 'parking', rows: 3, columns: 6, boats: {} },
          { id: 'workshop', name: 'Service Workshop', type: 'workshop', rows: 2, columns: 4, boats: {} }
        ];
        setLocations(defaultLocations);
        await window.storage.set('bbg:locations', JSON.stringify(defaultLocations));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Initialize with defaults
      const defaultLocations = [
        { id: 'rack-a', name: 'Rack Building A', type: 'rack', rows: 4, columns: 8, boats: {} },
        { id: 'rack-b', name: 'Rack Building B', type: 'rack', rows: 4, columns: 8, boats: {} },
        { id: 'parking', name: 'Outdoor Parking', type: 'parking', rows: 3, columns: 6, boats: {} },
        { id: 'workshop', name: 'Service Workshop', type: 'workshop', rows: 2, columns: 4, boats: {} }
      ];
      setLocations(defaultLocations);
      const defaultUsers = [
        { id: '1', username: 'admin', password: 'admin', role: 'admin', name: 'Admin User' }
      ];
      setUsers(defaultUsers);
    }
  };

  const saveBoats = async (newBoats) => {
    try {
      await window.storage.set('bbg:boats', JSON.stringify(newBoats));
      setBoats(newBoats);
    } catch (error) {
      console.error('Error saving boats:', error);
    }
  };

  const saveLocations = async (newLocations) => {
    try {
      await window.storage.set('bbg:locations', JSON.stringify(newLocations));
      setLocations(newLocations);
    } catch (error) {
      console.error('Error saving locations:', error);
    }
  };

  const handleLogin = (user) => {
    setIsAuthenticated(true);
    setCurrentUser(user);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentView('dashboard');
    setShowMobileMenu(false);
  };

  if (!isAuthenticated) {
    return <LoginScreen users={users} onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
        
        * {
          font-family: 'Inter', sans-serif;
        }
        
        h1, h2, h3, h4, h5, h6 {
          font-family: 'Archivo', sans-serif;
        }

        .boat-card {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .boat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.15);
        }

        .location-slot {
          transition: all 0.15s ease;
        }

        .location-slot:hover {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.3);
        }

        .location-slot.occupied:hover {
          transform: scale(1.02);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }

        .status-intake { background: linear-gradient(135deg, #3b82f6, #2563eb); }
        .status-service { background: linear-gradient(135deg, #f59e0b, #d97706); }
        .status-waiting { background: linear-gradient(135deg, #ef4444, #dc2626); }
        .status-ready { background: linear-gradient(135deg, #10b981, #059669); }
        .status-completed { background: linear-gradient(135deg, #6366f1, #4f46e5); }
      `}</style>

      {/* Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Boats By George</h1>
                <p className="text-xs text-slate-500 hidden sm:block">Asset Management System</p>
              </div>
            </div>

            {/* Main Navigation - Always visible */}
            <div className="flex items-center gap-2">
              <NavButton icon={Home} label="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
              <NavButton icon={Map} label="Locations" active={currentView === 'locations'} onClick={() => setCurrentView('locations')} />
              <NavButton icon={Package} label="Boats" active={currentView === 'boats'} onClick={() => setCurrentView('boats')} />
              <NavButton icon={Camera} label="Scan" active={currentView === 'scan'} onClick={() => setCurrentView('scan')} />
              <NavButton icon={Settings} label="Settings" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
              <div className="flex items-center ml-2 pl-2 border-l border-slate-200">
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && (
          <DashboardView boats={boats} locations={locations} onNavigate={setCurrentView} />
        )}
        {currentView === 'locations' && (
          <LocationsView
            locations={locations}
            boats={boats}
            onUpdateLocations={saveLocations}
            onUpdateBoats={saveBoats}
          />
        )}
        {currentView === 'boats' && (
          <BoatsView 
            boats={boats} 
            locations={locations} 
            onUpdateBoats={saveBoats}
            dockmasterConfig={dockmasterConfig}
            dockmasterToken={dockmasterToken}
            setDockmasterToken={setDockmasterToken}
          />
        )}
        {currentView === 'scan' && (
          <ScanView boats={boats} locations={locations} onUpdateBoats={saveBoats} />
        )}
        {currentView === 'settings' && (
          <SettingsView 
            dockmasterConfig={dockmasterConfig} 
            currentUser={currentUser}
            users={users}
            onSaveConfig={async (config) => {
              await window.storage.set('bbg:dockmaster', JSON.stringify(config));
              setDockmasterConfig(config);
              setDockmasterToken(null); // Reset token when credentials change
            }}
            onUpdateUsers={async (updatedUsers) => {
              await window.storage.set('bbg:users', JSON.stringify(updatedUsers));
              setUsers(updatedUsers);
            }}
          />
        )}
      </div>
    </div>
  );
}

// Login Screen Component
function LoginScreen({ users, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      onLogin(user);
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8 animate-slide-in">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Boats By George</h1>
            <p className="text-slate-600">Asset Management System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              Sign In
            </button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-slate-700 font-medium mb-2">Demo Credentials:</p>
            <p className="text-sm text-slate-600">Username: <span className="font-mono font-semibold">admin</span></p>
            <p className="text-sm text-slate-600">Password: <span className="font-mono font-semibold">admin</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Navigation Button Component
function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// Dashboard View Component
function DashboardView({ boats, locations, onNavigate }) {
  const statusCounts = {
    intake: boats.filter(b => b.status === 'intake').length,
    service: boats.filter(b => b.status === 'service').length,
    waiting: boats.filter(b => b.status === 'waiting').length,
    ready: boats.filter(b => b.status === 'ready').length,
    completed: boats.filter(b => b.status === 'completed').length,
  };

  const totalBoats = boats.length;
  const totalCapacity = locations.reduce((sum, loc) => sum + (loc.rows * loc.columns), 0);
  const occupancyRate = totalCapacity > 0 ? Math.round((totalBoats / totalCapacity) * 100) : 0;

  return (
    <div className="space-y-8 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h2>
        <p className="text-slate-600">Overview of Boats By George operations</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard
          title="Total Boats"
          value={totalBoats}
          icon={Package}
          color="blue"
          onClick={() => onNavigate('boats')}
        />
        <SummaryCard
          title="Locations"
          value={locations.length}
          icon={Map}
          color="purple"
          onClick={() => onNavigate('locations')}
        />
        <SummaryCard
          title="Total Capacity"
          value={totalCapacity}
          icon={Grid}
          color="indigo"
        />
        <SummaryCard
          title="Occupancy Rate"
          value={`${occupancyRate}%`}
          icon={Package}
          color="green"
        />
      </div>

      {/* Status Overview */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
        <h3 className="text-xl font-bold text-slate-900 mb-6">Boat Status Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatusCard status="intake" count={statusCounts.intake} label="Intake" />
          <StatusCard status="service" count={statusCounts.service} label="In Service" />
          <StatusCard status="waiting" count={statusCounts.waiting} label="Waiting" />
          <StatusCard status="ready" count={statusCounts.ready} label="Ready" />
          <StatusCard status="completed" count={statusCounts.completed} label="Completed" />
        </div>
      </div>

      {/* Recent Boats */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">Recent Boats</h3>
          <button
            onClick={() => onNavigate('boats')}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
          >
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {boats.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 mb-4">No boats registered yet</p>
            <button
              onClick={() => onNavigate('boats')}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Add First Boat
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {boats.slice(0, 6).map(boat => (
              <BoatCard key={boat.id} boat={boat} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color, onClick }) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    indigo: 'from-indigo-500 to-indigo-600',
    green: 'from-green-500 to-green-600',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-md p-6 border border-slate-200 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br ${colorClasses[color]} rounded-lg flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <p className="text-slate-600 text-sm font-medium mb-1">{title}</p>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function StatusCard({ status, count, label }) {
  return (
    <div className="text-center">
      <div className={`w-full h-24 status-${status} rounded-lg flex items-center justify-center mb-2 shadow-md`}>
        <span className="text-4xl font-bold text-white">{count}</span>
      </div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
    </div>
  );
}

// Locations View Component
function LocationsView({ locations, boats, onUpdateLocations, onUpdateBoats }) {
  const [editingLocation, setEditingLocation] = useState(null);
  const [assigningBoat, setAssigningBoat] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [viewMode, setViewMode] = useState('all'); // 'all' or 'single'
  const [selectedSingleLocation, setSelectedSingleLocation] = useState(null);
  const [draggedBoat, setDraggedBoat] = useState(null);

  const handleDragStart = (boat, fromLocation, fromSlot) => {
    setDraggedBoat({ boat, fromLocation, fromSlot });
  };

  const handleDrop = (toLocation, toRow, toCol) => {
    if (!draggedBoat) return;

    const toSlotId = `${toRow}-${toCol}`;
    
    // Check if target slot is already occupied
    if (toLocation.boats[toSlotId]) {
      alert('This slot is already occupied!');
      setDraggedBoat(null);
      return;
    }

    // Update locations - remove from old slot and add to new slot
    const updatedLocations = locations.map(loc => {
      const newBoats = { ...loc.boats };
      
      // Remove from old location
      if (loc.id === draggedBoat.fromLocation.id) {
        delete newBoats[draggedBoat.fromSlot];
      }
      
      // Add to new location
      if (loc.id === toLocation.id) {
        newBoats[toSlotId] = draggedBoat.boat.id;
      }
      
      return { ...loc, boats: newBoats };
    });

    // Update boat with new location info
    const updatedBoats = boats.map(b =>
      b.id === draggedBoat.boat.id
        ? { ...b, location: toLocation.name, slot: `${toRow + 1}-${toCol + 1}` }
        : b
    );

    onUpdateLocations(updatedLocations);
    onUpdateBoats(updatedBoats);
    setDraggedBoat(null);
  };

  const handleAddLocation = () => {
    const newLocation = {
      id: `location-${Date.now()}`,
      name: 'New Location',
      type: 'rack',
      rows: 3,
      columns: 6,
      boats: {}
    };
    onUpdateLocations([...locations, newLocation]);
    setEditingLocation(newLocation);
  };

  const handleSaveLocation = (updatedLocation) => {
    const updatedLocations = locations.map(loc =>
      loc.id === updatedLocation.id ? updatedLocation : loc
    );
    onUpdateLocations(updatedLocations);
    setEditingLocation(null);
  };

  const handleDeleteLocation = (locationId) => {
    if (confirm('Are you sure you want to delete this location? All boat assignments will be removed.')) {
      const updatedLocations = locations.filter(loc => loc.id !== locationId);
      onUpdateLocations(updatedLocations);
      if (selectedSingleLocation?.id === locationId) {
        setSelectedSingleLocation(null);
      }
    }
  };

  const handleSlotClick = (location, row, col) => {
    const slotId = `${row}-${col}`;
    const boatId = location.boats[slotId];

    if (boatId) {
      // Slot is occupied - remove boat
      if (confirm('Remove boat from this slot?')) {
        const updatedLocations = locations.map(loc => {
          if (loc.id === location.id) {
            const newBoats = { ...loc.boats };
            delete newBoats[slotId];
            return { ...loc, boats: newBoats };
          }
          return loc;
        });
        
        // Update boat to remove location info
        const updatedBoats = boats.map(b => 
          b.id === boatId ? { ...b, location: null, slot: null } : b
        );
        
        onUpdateLocations(updatedLocations);
        onUpdateBoats(updatedBoats);
      }
    } else {
      // Slot is empty - show boat selector
      setSelectedSlot({ locationId: location.id, slotId, row, col });
    }
  };

  const handleAssignBoat = (boat) => {
    if (!selectedSlot) return;

    // Remove boat from any previous location
    const updatedLocations = locations.map(loc => {
      const newBoats = { ...loc.boats };
      // Remove boat from previous slot
      Object.keys(newBoats).forEach(key => {
        if (newBoats[key] === boat.id) {
          delete newBoats[key];
        }
      });
      // Add boat to new slot
      if (loc.id === selectedSlot.locationId) {
        newBoats[selectedSlot.slotId] = boat.id;
      }
      return { ...loc, boats: newBoats };
    });

    // Update boat with location info
    const location = locations.find(l => l.id === selectedSlot.locationId);
    const updatedBoats = boats.map(b =>
      b.id === boat.id
        ? { ...b, location: location.name, slot: `${selectedSlot.row + 1}-${selectedSlot.col + 1}` }
        : b
    );

    onUpdateLocations(updatedLocations);
    onUpdateBoats(updatedBoats);
    setSelectedSlot(null);
  };

  const unassignedBoats = boats.filter(boat => {
    // Check if boat is not assigned to any location
    return !locations.some(loc => 
      Object.values(loc.boats).includes(boat.id)
    );
  });

  // Group locations by type
  const rackBuildings = locations.filter(l => l.type === 'rack');
  const parkingLots = locations.filter(l => l.type === 'parking');
  const workshops = locations.filter(l => l.type === 'workshop');

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Facility Layouts</h2>
          <p className="text-slate-600">Visual overview of all storage locations - drag boats to move them</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={`px-4 py-2 font-medium rounded-lg transition-colors ${
              viewMode === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            All Facilities
          </button>
          <button
            onClick={handleAddLocation}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Add Location
          </button>
        </div>
      </div>

      {/* All Facilities View */}
      {viewMode === 'all' && (
        <div className="space-y-8">
          {/* Rack Buildings Section */}
          {rackBuildings.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <Grid className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Rack Buildings</h3>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {rackBuildings.map(location => (
                  <LocationGrid
                    key={location.id}
                    location={location}
                    boats={boats}
                    onSlotClick={handleSlotClick}
                    onEdit={() => setEditingLocation(location)}
                    onDelete={() => handleDeleteLocation(location.id)}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    isDragging={!!draggedBoat}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Parking Lots Section */}
          {parkingLots.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Map className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Parking Lots</h3>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {parkingLots.map(location => (
                  <LocationGrid
                    key={location.id}
                    location={location}
                    boats={boats}
                    onSlotClick={handleSlotClick}
                    onEdit={() => setEditingLocation(location)}
                    onDelete={() => handleDeleteLocation(location.id)}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    isDragging={!!draggedBoat}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Workshops Section */}
          {workshops.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">Workshops</h3>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {workshops.map(location => (
                  <LocationGrid
                    key={location.id}
                    location={location}
                    boats={boats}
                    onSlotClick={handleSlotClick}
                    onEdit={() => setEditingLocation(location)}
                    onDelete={() => handleDeleteLocation(location.id)}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    isDragging={!!draggedBoat}
                  />
                ))}
              </div>
            </div>
          )}

          {locations.length === 0 && (
            <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
              <Map className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-4">No locations created yet</p>
              <button
                onClick={handleAddLocation}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Create First Location
              </button>
            </div>
          )}

          {/* Unassigned Boats Section */}
          {unassignedBoats.length > 0 && (
            <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-amber-600" />
                <h3 className="text-xl font-bold text-slate-900">Unassigned Boats ({unassignedBoats.length})</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {unassignedBoats.map(boat => (
                  <div
                    key={boat.id}
                    className={`p-3 status-${boat.status} rounded-lg text-center cursor-default`}
                  >
                    <p className="text-white font-semibold text-sm leading-tight">{boat.name}</p>
                    <p className="text-white text-xs opacity-90 mt-1">{boat.model}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-600 mt-4">Click on an empty slot in any facility to assign these boats</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Location Modal */}
      {editingLocation && (
        <EditLocationModal
          location={editingLocation}
          onSave={handleSaveLocation}
          onCancel={() => setEditingLocation(null)}
        />
      )}

      {/* Boat Assignment Modal */}
      {selectedSlot && (
        <BoatAssignmentModal
          boats={unassignedBoats}
          allBoats={boats}
          onAssign={handleAssignBoat}
          onCancel={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
}

// Location Grid Component
function LocationGrid({ location, boats, onSlotClick, onEdit, onDelete, onDragStart, onDrop, isDragging }) {
  const occupiedSlots = Object.keys(location.boats).length;
  const totalSlots = location.rows * location.columns;
  const occupancyRate = Math.round((occupiedSlots / totalSlots) * 100);

  const handleDragOver = (e) => {
    e.preventDefault(); // Allow drop
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-lg font-bold text-slate-900">{location.name}</h4>
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 hover:bg-white rounded-lg transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-600 capitalize">{location.type} • {location.rows} × {location.columns}</p>
          <p className="text-slate-700 font-medium">{occupiedSlots}/{totalSlots} ({occupancyRate}%)</p>
        </div>
      </div>

      {/* Grid */}
      <div className="p-4 bg-slate-50">
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div 
              className="grid gap-1.5" 
              style={{ 
                gridTemplateColumns: `repeat(${location.columns}, minmax(${location.columns > 8 ? '60px' : '70px'}, 1fr))` 
              }}
            >
              {Array.from({ length: location.rows }).map((_, row) =>
                Array.from({ length: location.columns }).map((_, col) => {
                  const slotId = `${row}-${col}`;
                  const boatId = location.boats[slotId];
                  const boat = boats.find(b => b.id === boatId);

                  return (
                    <div
                      key={slotId}
                      draggable={!!boat}
                      onDragStart={(e) => {
                        if (boat) {
                          onDragStart(boat, location, slotId);
                          e.dataTransfer.effectAllowed = 'move';
                        }
                      }}
                      onDragOver={handleDragOver}
                      onDrop={(e) => {
                        e.preventDefault();
                        onDrop(location, row, col);
                      }}
                      onClick={() => onSlotClick(location, row, col)}
                      className={`location-slot aspect-square border-2 rounded-lg p-1.5 flex flex-col items-center justify-center text-center transition-all ${
                        boat 
                          ? `status-${boat.status} border-transparent shadow-sm cursor-move` 
                          : isDragging 
                            ? 'border-blue-400 bg-blue-50 cursor-pointer animate-pulse' 
                            : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                      }`}
                    >
                      {boat ? (
                        <>
                          <p className="text-white font-bold text-xs leading-tight pointer-events-none">{boat.name}</p>
                          <p className="text-white text-[10px] opacity-90 mt-0.5 pointer-events-none">{boat.model}</p>
                        </>
                      ) : (
                        <div className="text-slate-400 pointer-events-none">
                          <p className="text-[10px] font-medium">{row + 1}-{col + 1}</p>
                          <Plus className="w-3 h-3 mx-auto mt-1 opacity-50" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {isDragging && (
        <div className="px-4 pb-4">
          <p className="text-sm text-blue-600 font-medium">Drop boat into an empty slot</p>
        </div>
      )}
    </div>
  );
}

// Boat Assignment Modal
function BoatAssignmentModal({ boats, allBoats, onAssign, onCancel }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllBoats, setShowAllBoats] = useState(false);

  const boatsToShow = showAllBoats ? allBoats : boats;
  const filteredBoats = boatsToShow.filter(boat =>
    boat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    boat.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
    boat.owner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col animate-slide-in">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900">Assign Boat to Slot</h3>
            <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search boats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showAll"
              checked={showAllBoats}
              onChange={(e) => setShowAllBoats(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="showAll" className="text-sm text-slate-700">
              Show boats already assigned to other locations
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {filteredBoats.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No boats available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredBoats.map(boat => (
                <button
                  key={boat.id}
                  onClick={() => onAssign(boat)}
                  className={`p-4 status-${boat.status} rounded-lg text-left hover:opacity-90 transition-opacity`}
                >
                  <p className="text-white font-bold mb-1">{boat.name}</p>
                  <p className="text-white text-sm opacity-90 mb-1">{boat.model}</p>
                  <p className="text-white text-xs opacity-75">Owner: {boat.owner}</p>
                  {boat.location && (
                    <p className="text-white text-xs opacity-75 mt-1">
                      Currently: {boat.location} ({boat.slot})
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function EditLocationModal({ location, onSave, onCancel }) {
  const [formData, setFormData] = useState(location);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">Edit Location</h3>
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
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="rack">Rack Building</option>
              <option value="parking">Parking Lot</option>
              <option value="workshop">Workshop</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {formData.type === 'workshop' ? 'Shop Bays' : 'Rows'}
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={formData.rows}
                onChange={(e) => setFormData({ ...formData, rows: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Columns</label>
              <input
                type="number"
                min="1"
                max="20"
                value={formData.columns}
                onChange={(e) => setFormData({ ...formData, columns: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-slate-700">
              <span className="font-medium">Total Capacity:</span> {formData.rows * formData.columns} {formData.type === 'workshop' ? 'bays' : 'slots'}
            </p>
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Settings View Component
function SettingsView({ dockmasterConfig, onSaveConfig, currentUser, users, onUpdateUsers }) {
  const [formData, setFormData] = useState(dockmasterConfig || {
    username: '',
    password: '',
    systemId: ''
  });
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState(currentUser?.role === 'admin' ? 'dockmaster' : 'profile');
  const [editingUser, setEditingUser] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const handleSave = async () => {
    await onSaveConfig(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleAddUser = (newUser) => {
    const user = {
      id: `user-${Date.now()}`,
      ...newUser
    };
    onUpdateUsers([...users, user]);
    setShowAddUser(false);
  };

  const handleUpdateUser = (updatedUser) => {
    const updatedUsers = users.map(u => u.id === updatedUser.id ? updatedUser : u);
    onUpdateUsers(updatedUsers);
    setEditingUser(null);
  };

  const handleDeleteUser = (userId) => {
    if (userId === currentUser?.id) {
      alert("You cannot delete your own account!");
      return;
    }
    if (confirm('Are you sure you want to delete this user?')) {
      onUpdateUsers(users.filter(u => u.id !== userId));
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Settings</h2>
        <p className="text-slate-600">Manage your system configuration and users</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('dockmaster')}
                className={`flex-1 px-6 py-3 font-medium transition-colors ${
                  activeTab === 'dockmaster'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Dockmaster API
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`flex-1 px-6 py-3 font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                User Management
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 px-6 py-3 font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            My Profile
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Dockmaster API Tab */}
          {activeTab === 'dockmaster' && isAdmin && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">Dockmaster API Configuration</h3>
              
              <div className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Dockmaster username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Dockmaster password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">System ID</label>
                  <input
                    type="text"
                    value={formData.systemId}
                    onChange={(e) => setFormData({ ...formData, systemId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your Dockmaster system ID"
                  />
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleSave}
                    className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md"
                  >
                    Save Configuration
                  </button>
                </div>

                {isSaved && (
                  <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
                    Configuration saved successfully!
                  </div>
                )}

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-slate-700 font-medium mb-2">About Dockmaster Integration</p>
                  <p className="text-sm text-slate-600">
                    These credentials will be used to authenticate with Dockmaster API and retrieve boat information. 
                    Your credentials are stored securely in your browser.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* User Management Tab */}
          {activeTab === 'users' && isAdmin && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900">User Management</h3>
                <button
                  onClick={() => setShowAddUser(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add User
                </button>
              </div>

              <div className="space-y-3">
                {users.map(user => (
                  <div key={user.id} className="p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{user.name}</p>
                        <p className="text-sm text-slate-600">@{user.username}</p>
                        <p className="text-xs text-slate-500 mt-1 capitalize">
                          Role: <span className={user.role === 'admin' ? 'text-blue-600 font-medium' : 'text-slate-600'}>{user.role}</span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={user.id === currentUser?.id}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={user.id === currentUser?.id ? "Cannot delete yourself" : "Delete User"}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* My Profile Tab */}
          {activeTab === 'profile' && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">My Profile</h3>
              
              <div className="space-y-4 max-w-2xl">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Name</p>
                  <p className="font-semibold text-slate-900">{currentUser?.name}</p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Username</p>
                  <p className="font-semibold text-slate-900">@{currentUser?.username}</p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Role</p>
                  <p className="font-semibold text-slate-900 capitalize">{currentUser?.role}</p>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-slate-700">
                    {isAdmin 
                      ? "You have administrator privileges and can manage system settings and users."
                      : "Contact an administrator to change your account settings."
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <UserModal
          onSave={handleAddUser}
          onCancel={() => setShowAddUser(false)}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <UserModal
          user={editingUser}
          onSave={handleUpdateUser}
          onCancel={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

// User Modal Component
function UserModal({ user, onSave, onCancel }) {
  const [formData, setFormData] = useState(user || {
    name: '',
    username: '',
    password: '',
    role: 'user'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">{user ? 'Edit User' : 'Add New User'}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Doe"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="johndoe"
              required
            />
          </div>

          {!user && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-slate-700">
              <span className="font-medium">Admin:</span> Full access to all settings and user management<br/>
              <span className="font-medium">User:</span> Can view and manage boats and locations only
            </p>
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
              {user ? 'Save Changes' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Boats View Component
function BoatsView({ boats, locations, onUpdateBoats, dockmasterConfig, dockmasterToken, setDockmasterToken }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingBoat, setEditingBoat] = useState(null);
  const [showAddBoat, setShowAddBoat] = useState(false);
  const [showBoatTypeSelector, setShowBoatTypeSelector] = useState(false);
  const [showDockmasterSearch, setShowDockmasterSearch] = useState(false);

  const filteredBoats = boats.filter(boat => {
    const matchesSearch = boat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         boat.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         boat.owner.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || boat.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleAddBoatClick = () => {
    if (!dockmasterConfig || !dockmasterConfig.username) {
      alert('Please configure Dockmaster API credentials in Settings first.');
      return;
    }
    setShowBoatTypeSelector(true);
  };

  const handleBoatTypeSelect = (type) => {
    setShowBoatTypeSelector(false);
    if (type === 'customer') {
      setShowDockmasterSearch(true);
    } else if (type === 'inventory') {
      alert('Inventory boat integration coming next!');
    }
  };

  const handleAddBoat = (newBoat) => {
    const boat = {
      id: `boat-${Date.now()}`,
      qrCode: `QR-${Date.now()}`,
      ...newBoat,
      location: null,
      slot: null
    };
    onUpdateBoats([...boats, boat]);
    setShowAddBoat(false);
  };

  const handleAddDockmasterBoat = (dockmasterBoat) => {
    const boat = {
      id: `boat-${Date.now()}`,
      qrCode: dockmasterBoat.qrCode || `QR-${Date.now()}`,
      name: dockmasterBoat.name,
      model: dockmasterBoat.model,
      owner: dockmasterBoat.owner,
      status: 'intake',
      location: null,
      slot: null,
      dockmasterId: dockmasterBoat.id,
      dockmasterData: dockmasterBoat
    };
    onUpdateBoats([...boats, boat]);
    setShowDockmasterSearch(false);
  };

  const handleUpdateBoat = (updatedBoat) => {
    const updatedBoats = boats.map(b => b.id === updatedBoat.id ? updatedBoat : b);
    onUpdateBoats(updatedBoats);
    setEditingBoat(null);
  };

  const handleDeleteBoat = (boatId) => {
    if (confirm('Are you sure you want to delete this boat?')) {
      onUpdateBoats(boats.filter(b => b.id !== boatId));
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Boats</h2>
          <p className="text-slate-600">Manage your boat inventory</p>
        </div>
        <button
          onClick={handleAddBoatClick}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
        >
          <Plus className="w-5 h-5" />
          Add Boat
        </button>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search boats by name, model, or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="intake">Intake</option>
            <option value="service">In Service</option>
            <option value="waiting">Waiting</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Boats Grid */}
      {filteredBoats.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md p-12 border border-slate-200 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">
            {boats.length === 0 ? 'No boats registered yet' : 'No boats match your search'}
          </p>
          {boats.length === 0 && (
            <button
              onClick={handleAddBoatClick}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Add First Boat
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBoats.map(boat => (
            <BoatCard
              key={boat.id}
              boat={boat}
              onEdit={() => setEditingBoat(boat)}
              onDelete={() => handleDeleteBoat(boat.id)}
            />
          ))}
        </div>
      )}

      {/* Boat Type Selector Modal */}
      {showBoatTypeSelector && (
        <BoatTypeSelectorModal
          onSelect={handleBoatTypeSelect}
          onCancel={() => setShowBoatTypeSelector(false)}
        />
      )}

      {/* Dockmaster Search Modal */}
      {showDockmasterSearch && (
        <DockmasterSearchModal
          dockmasterConfig={dockmasterConfig}
          dockmasterToken={dockmasterToken}
          setDockmasterToken={setDockmasterToken}
          onSelect={handleAddDockmasterBoat}
          onCancel={() => setShowDockmasterSearch(false)}
        />
      )}

      {/* Edit Boat Modal */}
      {editingBoat && (
        <BoatModal
          boat={editingBoat}
          locations={locations}
          onSave={handleUpdateBoat}
          onCancel={() => setEditingBoat(null)}
        />
      )}
    </div>
  );
}

// Boat Type Selector Modal
function BoatTypeSelectorModal({ onSelect, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900">Select Boat Type</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onSelect('customer')}
            className="w-full p-4 border-2 border-slate-300 hover:border-blue-500 rounded-lg text-left transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Customer Boat</p>
                <p className="text-sm text-slate-600">Import from Dockmaster customer database</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => onSelect('inventory')}
            className="w-full p-4 border-2 border-slate-300 hover:border-purple-500 rounded-lg text-left transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Inventory Boat</p>
                <p className="text-sm text-slate-600">Import from Dockmaster inventory</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// Dockmaster Search Modal
function DockmasterSearchModal({ dockmasterConfig, dockmasterToken, setDockmasterToken, onSelect, onCancel }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedBoat, setSelectedBoat] = useState(null);

  const authenticate = async () => {
    try {
      const response = await fetch('https://auth.dmeapi.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: dockmasterConfig.username,
          password: dockmasterConfig.password,
          systemId: dockmasterConfig.systemId
        })
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const data = await response.json();
      setDockmasterToken(data.access_token || data.token);
      return data.access_token || data.token;
    } catch (err) {
      throw new Error('Failed to authenticate with Dockmaster API');
    }
  };

  const searchBoats = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      let token = dockmasterToken;
      if (!token) {
        token = await authenticate();
      }

      const response = await fetch(`https://api.dmeapi.dev/api/v1/Boats/Search?query=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to re-authenticate
          token = await authenticate();
          const retryResponse = await fetch(`https://api.dmeapi.dev/api/v1/Boats/Search?query=${encodeURIComponent(searchQuery)}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (!retryResponse.ok) throw new Error('Search failed');
          const data = await retryResponse.json();
          setSearchResults(data.boats || data.results || data);
        } else {
          throw new Error('Search failed');
        }
      } else {
        const data = await response.json();
        setSearchResults(data.boats || data.results || data);
      }
    } catch (err) {
      setError(err.message || 'Failed to search boats. Please check your connection and credentials.');
    } finally {
      setLoading(false);
    }
  };

  const retrieveBoat = async (boatId) => {
    setLoading(true);
    setError(null);

    try {
      let token = dockmasterToken;
      if (!token) {
        token = await authenticate();
      }

      const response = await fetch(`https://api.dmeapi.dev/api/v1/Boats/RetrieveBoat?boatId=${boatId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to retrieve boat details');
      }

      const data = await response.json();
      onSelect({
        id: data.id || data.boatId,
        name: data.boatName || data.name,
        model: data.model || data.makeModel,
        owner: data.ownerName || data.customerName,
        qrCode: data.boatNumber || data.hullId,
        ...data
      });
    } catch (err) {
      setError(err.message || 'Failed to retrieve boat details');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col animate-slide-in">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-900">Search Customer Boats</h3>
            <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search by boat name, owner, or hull ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchBoats()}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={searchBoats}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg mb-4">
              {error}
            </div>
          )}

          {searchResults.length === 0 && !loading && !error && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Search for boats in Dockmaster</p>
              <p className="text-sm text-slate-400 mt-2">Enter a boat name, owner, or hull ID to get started</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="text-slate-500 mt-4">Searching Dockmaster...</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-3">
              {searchResults.map((boat, index) => (
                <button
                  key={boat.id || index}
                  onClick={() => retrieveBoat(boat.id || boat.boatId)}
                  className="w-full p-4 border-2 border-slate-200 hover:border-blue-500 rounded-lg text-left transition-all hover:shadow-md"
                >
                  <p className="font-semibold text-slate-900">{boat.boatName || boat.name}</p>
                  <p className="text-sm text-slate-600">{boat.model || boat.makeModel}</p>
                  <p className="text-sm text-slate-500">Owner: {boat.ownerName || boat.customerName}</p>
                  {(boat.boatNumber || boat.hullId) && (
                    <p className="text-xs text-slate-400 mt-1">ID: {boat.boatNumber || boat.hullId}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BoatCard({ boat, onEdit, onDelete, compact }) {
  const statusLabels = {
    intake: 'Intake',
    service: 'In Service',
    waiting: 'Waiting',
    ready: 'Ready',
    completed: 'Completed'
  };

  return (
    <div className="boat-card bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      <div className={`status-${boat.status} p-3`}>
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold text-sm">{statusLabels[boat.status]}</span>
          <span className="text-white text-xs opacity-90">{boat.qrCode}</span>
        </div>
      </div>
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
        </div>
        {!compact && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
            <button
              onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit
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

function BoatModal({ boat, locations, onSave, onCancel }) {
  const [formData, setFormData] = useState(boat || {
    name: '',
    model: '',
    owner: '',
    status: 'intake',
    location: '',
    slot: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-in">
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="intake">Intake</option>
              <option value="service">In Service</option>
              <option value="waiting">Waiting</option>
              <option value="ready">Ready</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Location (Optional)</label>
            <select
              value={formData.location || ''}
              onChange={(e) => setFormData({ ...formData, location: e.target.value, slot: '' })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No Location</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          </div>

          {formData.location && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Slot</label>
              <input
                type="text"
                value={formData.slot}
                onChange={(e) => setFormData({ ...formData, slot: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., A-12"
              />
            </div>
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
              {boat ? 'Save Changes' : 'Add Boat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Scan View Component
function ScanView({ boats, locations, onUpdateBoats }) {
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [foundBoat, setFoundBoat] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const startScanning = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setScanning(true);
      }
    } catch (error) {
      alert('Unable to access camera. Please check permissions or use manual entry.');
    }
  };

  const stopScanning = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const handleManualLookup = () => {
    const boat = boats.find(b => b.qrCode === manualCode);
    if (boat) {
      setFoundBoat(boat);
      setSelectedStatus(boat.status);
    } else {
      alert('Boat not found with that QR code');
    }
  };

  const handleUpdateStatus = () => {
    if (foundBoat && selectedStatus) {
      const updatedBoats = boats.map(b =>
        b.id === foundBoat.id ? { ...b, status: selectedStatus } : b
      );
      onUpdateBoats(updatedBoats);
      alert('Boat status updated successfully!');
      setFoundBoat(null);
      setManualCode('');
      setSelectedStatus('');
    }
  };

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Scan Boat</h2>
        <p className="text-slate-600">Scan QR code or enter manually to update boat status</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner Section */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
          <h3 className="text-xl font-bold text-slate-900 mb-4">QR Code Scanner</h3>
          
          {!scanning ? (
            <div className="space-y-4">
              <div className="aspect-video bg-slate-100 rounded-lg flex items-center justify-center">
                <Camera className="w-16 h-16 text-slate-400" />
              </div>
              <button
                onClick={startScanning}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <Camera className="w-5 h-5" />
                Start Camera
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={stopScanning}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Stop Camera
              </button>
              <p className="text-sm text-slate-600 text-center">
                Position QR code within the camera view
              </p>
            </div>
          )}
        </div>

        {/* Manual Entry Section */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
          <h3 className="text-xl font-bold text-slate-900 mb-4">Manual Entry</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">QR Code</label>
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter QR code manually"
              />
            </div>
            
            <button
              onClick={handleManualLookup}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Look Up Boat
            </button>

            {foundBoat && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg animate-slide-in">
                <h4 className="font-semibold text-slate-900 mb-2">Boat Found:</h4>
                <p className="text-slate-700 font-medium">{foundBoat.name}</p>
                <p className="text-slate-600 text-sm">{foundBoat.model}</p>
                <p className="text-slate-600 text-sm">Owner: {foundBoat.owner}</p>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Update Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="intake">Intake</option>
                    <option value="service">In Service</option>
                    <option value="waiting">Waiting</option>
                    <option value="ready">Ready</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <button
                  onClick={handleUpdateStatus}
                  className="w-full mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                >
                  Update Status
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Reference */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
        <h3 className="text-xl font-bold text-slate-900 mb-4">Status Reference</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 status-intake rounded-lg text-center">
            <p className="text-white font-semibold">Intake</p>
          </div>
          <div className="p-3 status-service rounded-lg text-center">
            <p className="text-white font-semibold">In Service</p>
          </div>
          <div className="p-3 status-waiting rounded-lg text-center">
            <p className="text-white font-semibold">Waiting</p>
          </div>
          <div className="p-3 status-ready rounded-lg text-center">
            <p className="text-white font-semibold">Ready</p>
          </div>
          <div className="p-3 status-completed rounded-lg text-center">
            <p className="text-white font-semibold">Completed</p>
          </div>
        </div>
      </div>
    </div>
  );
}