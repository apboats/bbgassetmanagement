# Boats by George - Asset Management System

A professional boat asset management system built with React, Vite, Supabase, and Tailwind CSS. Designed for managing customer boats, inventory, storage locations, service requests, and work orders.

## Features

### Boat Management
- **Customer Boats**: Track boats in for service with work phases, status tracking, and movement history
- **Inventory Boats**: Sync and manage inventory from Dockmaster with sales status tracking
- **Storage Boats**: Seasonal storage management with fall/spring work phases
- **Conversational Notes**: Chat-style notes thread on each boat for team communication

### Location Management
- **Visual Grid Layout**: Drag-and-drop boat assignment to storage slots
- **Multi-Site Support**: Organize locations by site with drag-and-drop reordering
- **Pool Areas**: Flexible overflow/staging areas without fixed slots
- **Touch Support**: Full touch/drag support for tablets and touch devices (Vibe Board)

### Service Requests
- **Rigging & Prep Requests**: Sales team creates requests linked to inventory boats
- **Kanban Board**: Drag-and-drop status management (Open → Scheduled → Service Complete → Closed)
- **Deadline Tracking**: Set due dates with overdue highlighting and filtering
- **Message Threads**: Communication between sales and service teams
- **Estimates Integration**: View and approve Dockmaster estimates

### Work Orders
- **Dockmaster Sync**: Automatic sync of work orders from Dockmaster API
- **Operations Tracking**: View labor hours, parts, and operation details
- **Internal Work Orders**: Track internal service work on inventory boats

### User Management
- **Role-Based Access**: Six user roles with granular permissions
- **Real-Time Sync**: Instant updates across all connected devices via Supabase Broadcast

## User Roles

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| `admin` | Full system access | All permissions, user management |
| `manager` | Operations management | Location management, cost visibility, boat deletion |
| `sales-manager` | Sales team lead | Same as manager + create service requests |
| `sales` | Sales team member | Create service requests |
| `service` | Service team member | Basic access for service work |
| `user` | Basic user | View-only access |

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime)
- **Integrations**: Dockmaster API for inventory and work order sync

## Prerequisites

- Node.js 18+
- Supabase account and project
- Dockmaster API credentials (for inventory sync)

## Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd bbgassetmanagement
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and configure:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Find credentials at: Supabase Dashboard → Settings → API

### 3. Database Setup

Apply migrations in order:

```bash
# Using Supabase CLI
supabase db push

# Or manually run each migration in supabase/migrations/ via SQL Editor
```

### 4. Deploy Edge Functions

```bash
supabase functions deploy
```

### 5. Run Development Server

```bash
npm run dev
```

App runs at `http://localhost:5173`

## Project Structure

```
bbgassetmanagement/
├── src/
│   ├── components/
│   │   ├── modals/           # Modal dialogs
│   │   │   ├── BoatDetailsModal.jsx
│   │   │   ├── InventoryBoatDetailsModal.jsx
│   │   │   ├── RequestModal.jsx
│   │   │   ├── RequestDetailModal.jsx
│   │   │   ├── WorkOrdersModal.jsx
│   │   │   ├── EstimateDetailsModal.jsx
│   │   │   └── UserModal.jsx
│   │   ├── locations/        # Location grid components
│   │   └── BoatComponents.jsx
│   ├── pages/
│   │   ├── BoatsView.jsx     # Customer boats page
│   │   ├── InventoryView.jsx # Inventory boats page
│   │   ├── RequestsView.jsx  # Service requests kanban
│   │   ├── LocationsView.jsx # Storage locations
│   │   ├── ReportsView.jsx   # Reports and analytics
│   │   └── UsersView.jsx     # User management
│   ├── hooks/
│   │   ├── useBoatDragDrop.js    # Drag-drop with touch support
│   │   ├── useRequestDragDrop.js # Request kanban drag-drop
│   │   ├── usePermissions.js     # Role-based permissions
│   │   └── useAssignBoat.js      # Boat assignment logic
│   ├── services/
│   │   └── supabaseService.js    # Database operations
│   ├── utils/
│   │   └── seasonHelpers.js      # Storage season logic
│   ├── App.jsx               # Main UI/routing
│   ├── AppContainer.jsx      # Data layer & state
│   ├── AuthProvider.jsx      # Authentication & permissions
│   └── supabaseClient.js     # Supabase configuration
├── supabase/
│   ├── migrations/           # Database migrations
│   └── functions/            # Edge functions
│       ├── dockmaster-inventory/
│       ├── dockmaster-workorders/
│       ├── dockmaster-internal-workorders-sync/
│       └── create-user/
└── public/
```

## Database Schema

### Core Tables
- `users` - User accounts with roles
- `boats` - Customer boats
- `inventory_boats` - Inventory from Dockmaster
- `locations` - Storage locations with grid configuration
- `sites` - Location groupings

### Service & Work Orders
- `service_requests` - Rigging/prep requests
- `request_messages` - Request message threads
- `work_orders` - Dockmaster work orders and estimates
- `work_order_operations` - Work order line items

### Notes & History
- `boat_notes` - Conversational notes on boats
- `boat_movement_history` - Location change audit trail

### Configuration
- `dockmaster_config` - API credentials
- `sync_status` - Sync job tracking
- `user_preferences` - Per-user settings

## Edge Functions

| Function | Purpose | Schedule |
|----------|---------|----------|
| `dockmaster-inventory` | Sync inventory boats | Every 15 min |
| `dockmaster-workorders` | Sync work orders | Every 2 min |
| `dockmaster-internal-workorders-sync` | Sync internal WOs | Every 2 min |
| `create-user` | Create new users with auth | On demand |

## Available Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

## Deployment

### Netlify (Current)

The app is deployed on Netlify. Push to `main` triggers automatic deployment.

Build settings:
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables configured in Netlify dashboard

### Manual Deployment

1. Build: `npm run build`
2. Deploy `dist/` folder to any static hosting

## Security

- Environment variables never committed (`.env` in `.gitignore`)
- Row Level Security (RLS) enabled on all tables
- Authentication required for all data access
- Role-based permissions enforced client and server-side

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env` exists (not just `.env.example`)
- Variables must start with `VITE_`
- Restart dev server after changes

### Database errors
- Check migrations applied in order
- Verify RLS policies are enabled
- Check Supabase logs for details

### Sync issues
- Verify Dockmaster credentials in `dockmaster_config` table
- Check `sync_status` table for error messages
- Review edge function logs in Supabase dashboard

### Touch drag not working
- Ensure `touch-action: none` CSS is applied to draggable elements
- Check for passive event listener warnings in console

## License

Proprietary software for Boats by George.

---

Built with React, Vite, Supabase, and Tailwind CSS
