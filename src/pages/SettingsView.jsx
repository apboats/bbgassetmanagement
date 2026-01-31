import React, { useState, useEffect } from 'react';
import { Settings, Users, Save, X, Edit2, Trash2, Plus, Shield, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { supabase } from '../supabaseClient';
import { usersService } from '../services/supabaseService';
import { usePermissions } from '../hooks/usePermissions';
import { UserModal } from '../components/modals/UserModal';

export function SettingsView({ dockmasterConfig, onSaveConfig, users, onUpdateUsers, onReloadUsers }) {
  // Get permissions from centralized hook
  const { currentUser, isAdmin } = usePermissions();
  // Still need useAuth for updatePassword function
  const { updatePassword } = useAuth();

  const [formData, setFormData] = useState(dockmasterConfig || {
    username: '',
    password: ''
  });
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleSave = async () => {
    await onSaveConfig(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleAddUser = async (newUser) => {
    // User was created via edge function, reload the users list
    if (onReloadUsers) {
      await onReloadUsers();
    }
    setShowAddUser(false);
  };

  const handleUpdateUser = async (updatedUser) => {
    try {
      // Find the original user to check if role changed
      const originalUser = users.find(u => u.id === updatedUser.id);
      if (originalUser && originalUser.role !== updatedUser.role) {
        // Persist role change to Supabase
        await usersService.updateRole(updatedUser.id, updatedUser.role);
      }
      // Reload users from database to get fresh data
      if (onReloadUsers) {
        await onReloadUsers();
      }
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user role. Please try again.');
    }
  };

  const handleDeleteUser = (userId) => {
    if (userId === currentUser.id) {
      alert('You cannot delete your own account!');
      return;
    }
    if (confirm('Are you sure you want to delete this user?')) {
      onUpdateUsers(users.filter(u => u.id !== userId));
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    try {
      const { error } = await updatePassword(newPassword);
      if (error) {
        setPasswordError(error.message || 'Failed to update password');
      } else {
        setPasswordSuccess(true);
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setShowChangePassword(false);
          setPasswordSuccess(false);
        }, 2000);
      }
    } catch (error) {
      setPasswordError('An error occurred while updating password');
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Settings</h2>
        <p className="text-slate-600">Manage your system configuration</p>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
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
          {isAdmin && (
            <>
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
            </>
          )}
        </div>

        <div className="p-6">
          {activeTab === 'profile' && (
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-6">My Profile</h3>
              <div className="space-y-4 max-w-2xl">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Name</p>
                  <p className="font-semibold text-slate-900">{currentUser.name}</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Username</p>
                  <p className="font-semibold text-slate-900">@{currentUser.username}</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Role</p>
                  <p className="font-semibold text-slate-900 capitalize">{currentUser.role}</p>
                </div>

                {/* Password Change Section */}
                <div className="mt-8 pt-8 border-t border-slate-200">
                  <h4 className="text-lg font-bold text-slate-900 mb-4">Change Password</h4>

                  {!showChangePassword ? (
                    <button
                      onClick={() => setShowChangePassword(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                    >
                      Change Password
                    </button>
                  ) : (
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter new password"
                          required
                          minLength={6}
                          disabled={passwordSuccess}
                        />
                        <p className="text-xs text-slate-500 mt-1">Minimum 6 characters</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Confirm Password
                        </label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Confirm new password"
                          required
                          minLength={6}
                          disabled={passwordSuccess}
                        />
                      </div>

                      {passwordError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-700">{passwordError}</p>
                        </div>
                      )}

                      {passwordSuccess && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-700">Password updated successfully!</p>
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={passwordSuccess}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Update Password
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowChangePassword(false);
                            setNewPassword('');
                            setConfirmPassword('');
                            setPasswordError('');
                            setPasswordSuccess(false);
                          }}
                          disabled={passwordSuccess}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

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
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                          <Users className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{user.name}</p>
                          <p className="text-sm text-slate-600">@{user.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {user.role}
                        </span>
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          disabled={user.id === currentUser.id}
                        >
                          <Trash2 className={`w-4 h-4 ${user.id === currentUser.id ? 'text-slate-300' : 'text-red-600'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    ✓ Configuration saved successfully!
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 font-medium mb-2">About Dockmaster Integration:</p>
                  <p className="text-sm text-blue-800">
                    Enter your Dockmaster API credentials to enable importing customer and inventory boats directly into your system.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Modals */}
      {showAddUser && (
        <UserModal
          user={null}
          onSave={handleAddUser}
          onCancel={() => setShowAddUser(false)}
        />
      )}
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


export default SettingsView;
