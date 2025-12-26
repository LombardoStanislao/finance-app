# Personal Finance Tracker PWA

A mobile-first Progressive Web App for tracking personal finances, built with React, Vite, Tailwind CSS, and Supabase.

## Features

- **Transaction Tracking**: Track income and expenses with categories, dates, and work-related flags
- **Net Worth Dashboard**: View total assets and virtual buckets
- **Monthly Overview**: See income vs expenses for the current month
- **Recent Transactions**: Quick view of your latest transactions
- **PWA Support**: Installable on mobile devices

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

3. Start the development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Database Schema

The app expects the following Supabase tables:
- `transactions` - Income and expense records
- `assets` - Net worth assets (liquidity, investments, crypto)
- `buckets` - Virtual savings buckets with allocation percentages
- `categories` - Transaction categories with optional budget limits

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Supabase
- Lucide React (icons)
- vite-plugin-pwa
