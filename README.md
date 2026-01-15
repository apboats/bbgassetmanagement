# Boats by George - Asset Management System

A professional boat asset management system built with React, Vite, Supabase, and Tailwind CSS.

## 🚀 Features

- **Boat Management**: Track customer boats and inventory boats
- **Location Management**: Manage storage locations with visual slot assignments
- **Real-time Updates**: Automatic synchronization across users via Supabase
- **Drag & Drop**: Intuitive boat assignment to storage slots
- **QR Code & NFC**: Support for QR codes and NFC tag scanning
- **User Roles**: Admin, Manager, and User roles with appropriate permissions
- **Dockmaster Integration**: Sync inventory boats from Dockmaster API
- **Custom Views**: Personalized location views per user

## 📋 Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- A Supabase account and project
- Git (for version control)

## 🛠️ Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd boats-by-george-asset-manager
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

   **Where to find your credentials:**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your project
   - Go to Settings → API
   - Copy "Project URL" and "anon public" key

### 4. Set Up Supabase Database

Run the SQL schema from `database/schema.sql` in your Supabase SQL editor:

1. Go to Supabase Dashboard → SQL Editor
2. Create a new query
3. Paste the contents of `database/schema.sql`
4. Run the query

This will create all necessary tables, indexes, and Row Level Security policies.

### 5. Run the Development Server

```bash
npm run dev
```

The app will open at `http://localhost:3000`

## 📁 Project Structure

```
boats-by-george-asset-manager/
├── src/
│   ├── services/
│   │   └── supabaseService.js    # Database operations
│   ├── App.jsx                    # Main UI component
│   ├── AppContainer.jsx           # Data layer wrapper
│   ├── AuthProvider.jsx           # Authentication context
│   ├── supabaseClient.js          # Supabase configuration
│   ├── main.jsx                   # App entry point
│   └── index.css                  # Global styles
├── index.html                     # HTML entry point
├── package.json                   # Dependencies
├── vite.config.js                 # Vite configuration
├── tailwind.config.js             # Tailwind CSS config
├── .env.example                   # Environment template
└── .gitignore                     # Git ignore rules
```

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## 🚢 Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your repository
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy!

### Deploy to Netlify

1. Push your code to GitHub
2. Go to [Netlify](https://netlify.com)
3. Import your repository
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables in Site settings → Environment
6. Deploy!

## 🔐 Security Notes

- **Never commit `.env`** - It's in `.gitignore` for a reason!
- The Supabase anon key is safe to expose in the frontend
- Row Level Security (RLS) in Supabase protects your data
- Users must be authenticated to access any data

## 📊 Database Schema

The app uses the following main tables:

- `users` - User accounts and roles
- `boats` - Customer boats
- `inventory_boats` - Inventory boats from Dockmaster
- `locations` - Storage locations
- `user_preferences` - User-specific settings
- `dockmaster_config` - Dockmaster API configuration

See `database/schema.sql` for the complete schema.

## 🐛 Troubleshooting

### "Missing Supabase environment variables"
- Make sure you created `.env` file (not `.env.example`)
- Check that variables start with `VITE_`
- Restart the dev server after adding variables

### Build errors
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- Clear Vite cache: `rm -rf .vite`

### Authentication issues
- Check RLS policies are enabled in Supabase
- Verify email confirmation settings in Supabase Auth

## 📝 Default Credentials

After running the schema, you can create your first user through the sign-up form in the app.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is proprietary software for Boats by George.

## 💬 Support

For issues or questions, please contact the development team.

---

Built with ❤️ using React, Vite, Supabase, and Tailwind CSS
