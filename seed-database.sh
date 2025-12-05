#!/bin/bash

# Seed TheFesta Database Script
# This script applies the seed data to your Supabase database

echo "🌱 Seeding TheFesta Database..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo ""
    echo "Install it with:"
    echo "  npm install -g supabase"
    echo ""
    echo "Or apply the seed manually:"
    echo "  1. Open your Supabase dashboard"
    echo "  2. Go to SQL Editor"
    echo "  3. Copy and paste the contents of supabase/seed.sql"
    echo "  4. Run the SQL"
    exit 1
fi

# Apply seed data
echo "Applying seed data from supabase/seed.sql..."
supabase db reset

echo ""
echo "✅ Database seeded successfully!"
echo ""
echo "Your database now has:"
echo "  • 8 sample vendors with proper business names"
echo "  • Reviews and ratings"
echo "  • Portfolio items"
echo ""
