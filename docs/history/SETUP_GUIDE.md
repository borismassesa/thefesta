# The Festa - Complete Setup Guide

## ✅ Completed Setup Steps

1. **Project Structure** - Monorepo with npm workspaces ✓
2. **Dependencies** - All packages installed ✓
3. **Theme Configuration** - Starry Night palette applied ✓
4. **TypeScript Configuration** - Fixed and ready ✓

## 🚀 Quick Start (Development)

### 1. Database Setup - SQLite (Local Development)

We'll use SQLite for local development (easier setup). For production, we'll use PostgreSQL.

```bash
# Navigate to database package
cd packages/db

# Generate Prisma client
npx prisma generate

# Create database and run migrations
npx prisma db push

# (Optional) Seed sample data
npm run seed
```

### 2. Environment Variables

Copy the development environment template:

```bash
cp env.development .env.local
```

Update `.env.local` with your local values (for now, just update the database URL):

```env
DATABASE_URL="file:./dev.db"
```

### 3. Start Development Servers

```bash
# Start all services (mobile app + API)
npm run dev

# Or start individually:

# Mobile app only
cd apps/mobile && npm start

# Vendor portal only
cd apps/vendor-portal && npm run dev
```

## 📦 Service Setup (As Needed)

### AWS Cognito (Authentication)

1. Go to AWS Console → Cognito
2. Create a new User Pool
3. Enable phone number authentication
4. Create an app client
5. Update `.env.local` with:
   ```env
   COGNITO_USER_POOL_ID=your-pool-id
   COGNITO_CLIENT_ID=your-client-id
   ```

### Africa's Talking (SMS/Payments)

1. Sign up at https://africastalking.com
2. Get sandbox API key
3. Update `.env.local`:
   ```env
   AFRICASTALKING_API_KEY=your-sandbox-key
   AFRICASTALKING_USERNAME=sandbox
   ```

### Algolia (Search)

1. Sign up at https://www.algolia.com
2. Create a new application
3. Create an index named `vendors`
4. Update `.env.local`:
   ```env
   ALGOLIA_APP_ID=your-app-id
   ALGOLIA_API_KEY=your-api-key
   ```

## 🏗️ Production Setup

### PostgreSQL Database

For production, use PostgreSQL:

```bash
# Install PostgreSQL (macOS)
brew install postgresql@14

# Start PostgreSQL
brew services start postgresql@14

# Create database
createdb thefesta_dev

# Update .env.local
DATABASE_URL="postgresql://postgres:password@localhost:5432/thefesta_dev?schema=public"
```

### AWS Infrastructure

1. **Cognito** - User authentication
2. **Aurora PostgreSQL** - Main database
3. **DynamoDB** - Real-time chat/notifications
4. **S3 + CloudFront** - File storage
5. **AppSync** - GraphQL API
6. **Lambda** - API functions
7. **SNS/Pinpoint** - Push notifications

## 🧪 Testing

```bash
# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📱 Mobile App Development

```bash
cd apps/mobile

# Start Expo dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

## 🔧 Troubleshooting

### Issue: "Cannot find module"
**Solution**: Run `npm install` in the root directory

### Issue: "Prisma client not found"
**Solution**: Run `cd packages/db && npx prisma generate`

### Issue: "Port already in use"
**Solution**: Kill the process using the port or use a different port

### Issue: "Expo command not found"
**Solution**: Install Expo CLI globally: `npm install -g expo-cli`

## 📚 Next Steps

1. ✅ Complete database setup
2. ✅ Set up authentication (Cognito + SMS)
3. ✅ Build onboarding screens
4. ✅ Implement phone/OTP login
5. ✅ Create event management features
6. ✅ Build vendor discovery
7. ✅ Implement booking system
8. ✅ Add payment integration

See `phase-1-build-plan.plan.md` for the complete implementation plan.

