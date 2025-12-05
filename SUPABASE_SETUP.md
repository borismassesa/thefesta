# Supabase Setup Guide for TheFesta

This guide will help you set up Supabase for the TheFesta marketplace platform.

## Prerequisites

- A Supabase account ([sign up at supabase.com](https://supabase.com))
- Node.js 20+ installed
- Basic understanding of PostgreSQL

## Step 1: Create a New Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Fill in the details:
   - **Name**: TheFesta
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to your target users
4. Click "Create new project" and wait for setup to complete (~2 minutes)

## Step 2: Get Your Project Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (starts with `eyJ...`)
   - **service_role** key (keep this secret!)

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example apps/website/.env.local
   ```

2. Edit `apps/website/.env.local` and add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

## Step 4: Run Database Migrations

You have two options to set up your database:

### Option A: Using Supabase CLI (Recommended)

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```
   (Find your project ref in the Supabase dashboard URL or settings)

4. Push migrations:
   ```bash
   supabase db push
   ```

5. Seed the database:
   ```bash
   supabase db seed
   ```

### Option B: Manual SQL Execution

1. In your Supabase dashboard, go to **SQL Editor**
2. Create a new query
3. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Paste and click "Run"
5. Wait for completion
6. Repeat steps 2-5 with `supabase/seed.sql` for sample data

## Step 5: Configure Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Enable **Email** provider
3. Configure email templates (optional):
   - Go to **Authentication** → **Email Templates**
   - Customize the confirmation and password reset emails

### Email Configuration (Optional)

For production, configure a custom SMTP server:

1. Go to **Settings** → **Auth**
2. Scroll to **SMTP Settings**
3. Add your email provider details (e.g., Resend, SendGrid)

## Step 6: Set Up Row Level Security (RLS)

RLS is automatically configured in the migration file, but verify it's enabled:

1. Go to **Authentication** → **Policies**
2. Ensure all tables have RLS enabled
3. Review policies for each table

## Step 7: Verify Setup

Run this quick verification:

```sql
-- In Supabase SQL Editor, run:
SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC;
```

You should see these tables:
- users
- vendors
- portfolio
- inquiries
- saved_vendors

## Step 8: Test the Connection

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. The app should now connect to Supabase successfully

## Database Schema Overview

### Tables Created

1. **users** - User accounts (both regular users and vendors)
2. **vendors** - Vendor business profiles
3. **portfolio** - Vendor portfolio items (photos, work samples)
4. **inquiries** - Contact inquiries from users to vendors
5. **saved_vendors** - Users' saved/bookmarked vendors

### Key Features

- **Row Level Security (RLS)**: All tables are protected with RLS policies
- **Auto-incrementing stats**: Vendor views, saves, and inquiries auto-update
- **Cascading deletes**: Deleting a vendor removes all related data
- **Updated_at triggers**: Automatic timestamp updates on all tables
- **JSONB fields**: Flexible storage for location, stats, and contact info

## Seed Data

The seed file creates 8 sample vendors across different categories:
- 2 Venues (Sea Cliff Hotel, Hyatt Regency)
- 2 Photographers (Bella Photography, Urban Events)
- 1 Videographer (Salty Love Films)
- 1 Caterer (Elegant Catering)
- 1 Wedding Planner (Perfect Day Planners)
- 1 Florist (Bloom & Petal)

## Troubleshooting

### "Missing environment variables" error
- Ensure `.env.local` is in `apps/website/` directory
- Restart your dev server after adding env vars

### "Invalid API key" error
- Double-check your SUPABASE_ANON_KEY in `.env.local`
- Make sure there are no extra spaces or quotes

### Migration fails
- Ensure you're running PostgreSQL 14+
- Check if tables already exist (drop them first if testing)
- Review Supabase logs in dashboard

### RLS policies blocking access
- Verify user is authenticated
- Check policy conditions match your use case
- Temporarily disable RLS for debugging (re-enable after!)

## Next Steps

After setup is complete:

1. ✅ Test user registration/login
2. ✅ Create a test vendor profile
3. ✅ Upload portfolio images
4. ✅ Test the inquiry system
5. ✅ Test saving vendors

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)

## Support

If you encounter issues:
1. Check Supabase dashboard logs
2. Review the troubleshooting section above
3. Consult Supabase documentation
4. Check Supabase Discord community
