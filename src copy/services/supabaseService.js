// ============================================================================
// SUPABASE SERVICE LAYER
// ============================================================================
// Central location for all database operations
// Import this file and call functions instead of using localStorage
// ============================================================================

import { supabase } from '../supabaseClient'

// ============================================================================
// AUTHENTICATION OPERATIONS
// ============================================================================

export const authService = {
  // Sign up new user
  async signUp(email, password, userData) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) throw authError

    // Create user profile in users table
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('users')
        .insert([
          {
            auth_id: authData.user.id,
            username: userData.username,
            name: userData.name,
            email: email,
            role: 'user', // Default role, admin can change later
          },
        ])

      if (profileError) throw profileError
    }

    return authData
  },

  // Sign in existing user
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
    return data
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  // Get current session
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },

  // Get current user profile (from users table)
  async getCurrentUser() {
    const session = await this.getSession()
    if (!session) return null

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', session.user.id)
      .single()

    if (error) throw error
    return data
  },

  // Request password reset email
  async resetPasswordRequest(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) throw error
    return data
  },

  // Update password (called after user clicks reset link)
  async updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) throw error
    return data
  },
}

// ============================================================================
// BOATS OPERATIONS (Customer Boats)
// ============================================================================

export const boatsService = {
  // Get all boats
  async getAll() {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Get single boat by ID
  async getById(id) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Get boat by QR code
  async getByQrCode(qrCode) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('qr_code', qrCode)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Get boat by NFC tag
  async getByNfcTag(nfcTag) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('nfc_tag', nfcTag)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Create new boat
  async create(boatData) {
    const { data, error } = await supabase
      .from('boats')
      .insert([boatData])
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Update boat
  async update(id, updates) {
    const { data, error } = await supabase
      .from('boats')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Delete boat
  async delete(id) {
    const { error } = await supabase
      .from('boats')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Batch update boats (for location assignments, etc.)
  async batchUpdate(boats) {
    const promises = boats.map(boat => 
      this.update(boat.id, boat)
    )
    return Promise.all(promises)
  },

  // Search boats by name, model, or owner
  async search(query) {
    const lowerQuery = query.toLowerCase()
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .or(`name.ilike.%${lowerQuery}%,model.ilike.%${lowerQuery}%,owner.ilike.%${lowerQuery}%`)

    if (error) throw error
    return data || []
  },

  // Get boats by status
  async getByStatus(status) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('status', status)

    if (error) throw error
    return data || []
  },

  // Get boats at a specific location
  async getByLocation(locationName) {
    const { data, error } = await supabase
      .from('boats')
      .select('*')
      .eq('location', locationName)

    if (error) throw error
    return data || []
  },

  // Assign NFC tag to boat
  async assignNfcTag(boatId, nfcTag) {
    // First check if tag is already assigned
    const existing = await this.getByNfcTag(nfcTag)
    if (existing && existing.id !== boatId) {
      throw new Error('NFC tag is already assigned to another boat')
    }

    return this.update(boatId, { nfc_tag: nfcTag })
  },

  // Release NFC tag from boat
  async releaseNfcTag(boatId) {
    return this.update(boatId, { nfc_tag: null })
  },

  // Archive boat (set to archived status)
  async archive(boatId) {
    return this.update(boatId, {
      status: 'archived',
      archived_date: new Date().toISOString(),
    })
  },

  // Release boat (archive + remove from location)
  async release(boatId) {
    const boat = await this.getById(boatId)
    
    // Remove from location if assigned
    if (boat.location && boat.slot) {
      const { data: locations } = await supabase
        .from('locations')
        .select('*')
        .eq('name', boat.location)

      if (locations && locations.length > 0) {
        const location = locations[0]
        const updatedBoats = { ...location.boats }
        delete updatedBoats[boat.slot]

        await supabase
          .from('locations')
          .update({ boats: updatedBoats })
          .eq('id', location.id)
      }
    }

    // Archive the boat
    return this.archive(boatId)
  },

  // Assign boat to location slot (updates both boat and location)
  async assignToSlot(boatId, locationId, slotId) {
    // Get location
    const { data: location, error: locError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', locationId)
      .single()

    if (locError) throw locError

    // Check if slot is occupied
    if (location.boats && location.boats[slotId]) {
      throw new Error('Slot is already occupied')
    }

    // Get boat
    const boat = await this.getById(boatId)

    // Remove from old location if exists
    if (boat.location && boat.slot) {
      await this.removeFromSlot(boatId)
    }

    // Update location with new boat
    const updatedBoats = { ...location.boats, [slotId]: boatId }
    await supabase
      .from('locations')
      .update({ boats: updatedBoats })
      .eq('id', locationId)

    // Update boat with new location/slot
    return this.update(boatId, {
      location: location.name,
      slot: slotId,
    })
  },

  // Remove boat from location slot
  async removeFromSlot(boatId) {
    const boat = await this.getById(boatId)
    
    if (!boat.location || !boat.slot) {
      return boat // Already unassigned
    }

    // Find and update location
    const { data: locations } = await supabase
      .from('locations')
      .select('*')
      .eq('name', boat.location)

    if (locations && locations.length > 0) {
      const location = locations[0]
      const updatedBoats = { ...location.boats }
      delete updatedBoats[boat.slot]

      await supabase
        .from('locations')
        .update({ boats: updatedBoats })
        .eq('id', location.id)
    }

    // Update boat
    return this.update(boatId, {
      location: null,
      slot: null,
    })
  },

  // Move boat from one slot to another (handles same or different locations)
  async moveToSlot(boatId, toLocationId, toSlotId) {
    // Get target location
    const { data: toLocation, error: locError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', toLocationId)
      .single()

    if (locError) throw locError

    // Check if target slot is occupied
    if (toLocation.boats && toLocation.boats[toSlotId]) {
      throw new Error('Target slot is already occupied')
    }

    const boat = await this.getById(boatId)

    // Remove from old location
    if (boat.location && boat.slot) {
      const { data: oldLocations } = await supabase
        .from('locations')
        .select('*')
        .eq('name', boat.location)

      if (oldLocations && oldLocations.length > 0) {
        const oldLocation = oldLocations[0]
        const updatedOldBoats = { ...oldLocation.boats }
        delete updatedOldBoats[boat.slot]

        await supabase
          .from('locations')
          .update({ boats: updatedOldBoats })
          .eq('id', oldLocation.id)
      }
    }

    // Add to new location
    const updatedNewBoats = { ...toLocation.boats, [toSlotId]: boatId }
    await supabase
      .from('locations')
      .update({ boats: updatedNewBoats })
      .eq('id', toLocationId)

    // Update boat
    return this.update(boatId, {
      location: toLocation.name,
      slot: toSlotId,
    })
  },
}

// ============================================================================
// INVENTORY BOATS OPERATIONS (Dockmaster API Boats)
// ============================================================================

export const inventoryBoatsService = {
  // Get all inventory boats
  async getAll() {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Get single inventory boat by ID
  async getById(id) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Get by Dockmaster ID
  async getByDockmasterId(dockmasterId) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('dockmaster_id', dockmasterId)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Get by Hull ID (HIN)
  async getByHullId(hullId) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('hull_id', hullId)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Search by Hull ID (partial match)
  async searchByHullId(query) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .ilike('hull_id', `%${query}%`)

    if (error) throw error
    return data || []
  },

  // Create new inventory boat
  async create(boatData) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .insert([boatData])
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Update inventory boat
  async update(id, updates) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Sync from Dockmaster API
  async sync(apiBoats) {
    // Get existing inventory boats
    const existing = await this.getAll()
    const existingMap = new Map(
      existing.map(b => [b.dockmaster_id, b])
    )

    const toUpdate = []
    const toCreate = []
    const toDelete = []
    const apiDockmasterIds = new Set(apiBoats.map(b => b.dockmaster_id))

    // Process API boats
    for (const apiBoat of apiBoats) {
      if (existingMap.has(apiBoat.dockmaster_id)) {
        // Update existing
        const existingBoat = existingMap.get(apiBoat.dockmaster_id)
        toUpdate.push({
          id: existingBoat.id,
          ...apiBoat,
          last_synced: new Date().toISOString()
        })
      } else {
        // Create new
        toCreate.push({
          ...apiBoat,
          last_synced: new Date().toISOString()
        })
      }
    }

    // Find boats to delete (in our DB but not in API response - likely became SD)
    for (const existingBoat of existing) {
      if (!apiDockmasterIds.has(existingBoat.dockmaster_id)) {
        toDelete.push(existingBoat.id)
      }
    }

    // Batch operations
    const operations = []

    if (toCreate.length > 0) {
      operations.push(
        supabase.from('inventory_boats').insert(toCreate)
      )
    }

    if (toUpdate.length > 0) {
      operations.push(
        ...toUpdate.map(boat => 
          supabase
            .from('inventory_boats')
            .update(boat)
            .eq('id', boat.id)
        )
      )
    }

    if (toDelete.length > 0) {
      console.log(`Deleting ${toDelete.length} inventory boats no longer in Dockmaster`)
      operations.push(
        supabase
          .from('inventory_boats')
          .delete()
          .in('id', toDelete)
      )
    }

    await Promise.all(operations)

    // Return synced boats
    return this.getAll()
  },

  // Delete inventory boat
  async delete(id) {
    const { error } = await supabase
      .from('inventory_boats')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Search inventory boats
  async search(query) {
    const lowerQuery = query.toLowerCase()
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .or(`name.ilike.%${lowerQuery}%,model.ilike.%${lowerQuery}%,make.ilike.%${lowerQuery}%,hull_id.ilike.%${lowerQuery}%,dockmaster_id.ilike.%${lowerQuery}%`)

    if (error) throw error
    return data || []
  },

  // Get by sales status
  async getBySalesStatus(salesStatus) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('sales_status', salesStatus)

    if (error) throw error
    return data || []
  },

  // Get by year
  async getByYear(year) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('year', year)

    if (error) throw error
    return data || []
  },

  // Get by make
  async getByMake(make) {
    const { data, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('make', make)

    if (error) throw error
    return data || []
  },

  // Assign NFC tag to inventory boat
  async assignNfcTag(boatId, nfcTag) {
    const { data: existing, error } = await supabase
      .from('inventory_boats')
      .select('*')
      .eq('nfc_tag', nfcTag)

    // If we found a boat with this tag and it's not the current boat, throw error
    if (existing && existing.length > 0 && existing[0].id !== boatId) {
      throw new Error('NFC tag is already assigned to another boat')
    }

    return this.update(boatId, { nfc_tag: nfcTag })
  },

  // Release NFC tag
  async releaseNfcTag(boatId) {
    return this.update(boatId, { nfc_tag: null })
  },

  // Assign to location slot
  async assignToSlot(boatId, locationId, slotId) {
    const { data: location, error: locError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', locationId)
      .single()

    if (locError) throw locError

    if (location.boats && location.boats[slotId]) {
      throw new Error('Slot is already occupied')
    }

    const boat = await this.getById(boatId)

    // Remove from old location if exists
    if (boat.location && boat.slot) {
      await this.removeFromSlot(boatId)
    }

    // Update location
    const updatedBoats = { ...location.boats, [slotId]: boatId }
    await supabase
      .from('locations')
      .update({ boats: updatedBoats })
      .eq('id', locationId)

    // Update boat
    return this.update(boatId, {
      location: location.name,
      slot: slotId,
    })
  },

  // Remove from slot
  async removeFromSlot(boatId) {
    const boat = await this.getById(boatId)
    
    if (!boat.location || !boat.slot) {
      return boat
    }

    const { data: locations } = await supabase
      .from('locations')
      .select('*')
      .eq('name', boat.location)

    if (locations && locations.length > 0) {
      const location = locations[0]
      const updatedBoats = { ...location.boats }
      delete updatedBoats[boat.slot]

      await supabase
        .from('locations')
        .update({ boats: updatedBoats })
        .eq('id', location.id)
    }

    return this.update(boatId, {
      location: null,
      slot: null,
    })
  },

  // Move to slot
  async moveToSlot(boatId, toLocationId, toSlotId) {
    const { data: toLocation, error: locError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', toLocationId)
      .single()

    if (locError) throw locError

    if (toLocation.boats && toLocation.boats[toSlotId]) {
      throw new Error('Target slot is already occupied')
    }

    const boat = await this.getById(boatId)

    if (boat.location && boat.slot) {
      const { data: oldLocations } = await supabase
        .from('locations')
        .select('*')
        .eq('name', boat.location)

      if (oldLocations && oldLocations.length > 0) {
        const oldLocation = oldLocations[0]
        const updatedOldBoats = { ...oldLocation.boats }
        delete updatedOldBoats[boat.slot]

        await supabase
          .from('locations')
          .update({ boats: updatedOldBoats })
          .eq('id', oldLocation.id)
      }
    }

    const updatedNewBoats = { ...toLocation.boats, [toSlotId]: boatId }
    await supabase
      .from('locations')
      .update({ boats: updatedNewBoats })
      .eq('id', toLocationId)

    return this.update(boatId, {
      location: toLocation.name,
      slot: toSlotId,
    })
  },
}

// ============================================================================
// LOCATIONS OPERATIONS
// ============================================================================

export const locationsService = {
  // Get all locations
  async getAll() {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Get single location
  async getById(id) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Create location
  async create(locationData) {
    const { data, error } = await supabase
      .from('locations')
      .insert([locationData])
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Update location
  async update(id, updates) {
    const { data, error } = await supabase
      .from('locations')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Delete location
  async delete(id) {
    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Batch update locations (for boat assignments)
  async batchUpdate(locations) {
    const promises = locations.map(location =>
      this.update(location.id, location)
    )
    return Promise.all(promises)
  },

  // Get location by name
  async getByName(name) {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('name', name)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Get all boats at a location (returns full boat objects)
  async getBoatsAtLocation(locationId, boatsData) {
    const location = await this.getById(locationId)
    if (!location || !location.boats) return []

    const boatIds = Object.values(location.boats)
    return boatsData.filter(boat => boatIds.includes(boat.id))
  },

  // Clear all boats from location (emergency use)
  async clearAllBoats(locationId) {
    return this.update(locationId, { boats: {} })
  },
}

// ============================================================================
// USER PREFERENCES OPERATIONS
// ============================================================================

export const preferencesService = {
  // Get user preferences
  async get(userId) {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Save user preferences (upsert)
  async save(userId, preferences) {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: userId,
          selected_locations: preferences.selectedLocations || [],
          location_order: preferences.locationOrder || [],
        },
        { onConflict: 'user_id' }
      )
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },
}

// ============================================================================
// DOCKMASTER CONFIG OPERATIONS
// ============================================================================

export const dockmasterService = {
  // Get config
  async getConfig() {
    const { data, error } = await supabase
      .from('dockmaster_config')
      .select('*')
      .limit(1)

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },

  // Save config (upsert)
  async saveConfig(config) {
    // Check if config exists
    const existing = await this.getConfig()

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('dockmaster_config')
        .update(config)
        .eq('id', existing.id)
        .select()

      if (error) throw error
      return data && data.length > 0 ? data[0] : null
    } else {
      // Create new
      const { data, error } = await supabase
        .from('dockmaster_config')
        .insert([config])
        .select()

      if (error) throw error
      return data && data.length > 0 ? data[0] : null
    }
  },

  // Update last sync time
  async updateLastSync() {
    const existing = await this.getConfig()
    if (!existing) return

    const { error } = await supabase
      .from('dockmaster_config')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) throw error
  },
}

// ============================================================================
// USERS OPERATIONS (Admin only)
// ============================================================================

export const usersService = {
  // Get all users
  async getAll() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // Update user role
  async updateRole(userId, role) {
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select()

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
  },
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS (Optional - for live updates)
// ============================================================================

export const subscriptions = {
  // Subscribe to boats changes
  subscribeToBoats(callback) {
    return supabase
      .channel('boats-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boats' },
        callback
      )
      .subscribe()
  },

  // Subscribe to locations changes
  subscribeToLocations(callback) {
    return supabase
      .channel('locations-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'locations' },
        callback
      )
      .subscribe()
  },

  // Subscribe to inventory boats changes
  subscribeToInventoryBoats(callback) {
    return supabase
      .channel('inventory-boats-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_boats' },
        callback
      )
      .subscribe()
  },

  // Unsubscribe from channel
  unsubscribe(channel) {
    supabase.removeChannel(channel)
  },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Get all boats (combines regular boats and inventory boats)
export const getAllBoatsCombined = async () => {
  const [regularBoats, inventoryBoats] = await Promise.all([
    boatsService.getAll(),
    inventoryBoatsService.getAll()
  ])

  // Add isInventory flag to inventory boats
  const markedInventoryBoats = inventoryBoats.map(boat => ({
    ...boat,
    isInventory: true
  }))

  return [...regularBoats, ...markedInventoryBoats]
}

// Convert database snake_case to camelCase (for consistency with current app)
export const toCamelCase = (obj) => {
  if (!obj) return obj
  if (Array.isArray(obj)) return obj.map(toCamelCase)
  if (typeof obj !== 'object') return obj

  const camelObj = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    camelObj[camelKey] = typeof value === 'object' ? toCamelCase(value) : value
  }
  return camelObj
}

// Convert camelCase to snake_case for database
export const toSnakeCase = (obj) => {
  if (!obj) return obj
  if (Array.isArray(obj)) return obj.map(toSnakeCase)
  if (typeof obj !== 'object') return obj

  const snakeObj = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    snakeObj[snakeKey] = typeof value === 'object' ? toSnakeCase(value) : value
  }
  return snakeObj
}

// ============================================================================
// EXPORT ALL SERVICES
// ============================================================================

export default {
  auth: authService,
  boats: boatsService,
  inventoryBoats: inventoryBoatsService,
  locations: locationsService,
  preferences: preferencesService,
  dockmaster: dockmasterService,
  users: usersService,
  subscriptions,
  getAllBoatsCombined,
  toCamelCase,
  toSnakeCase,
}
