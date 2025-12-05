#!/bin/bash

# The Festa - Development Setup Script
# This script helps set up the development environment

echo "🎉 Welcome to The Festa Development Setup!"
echo "=========================================="

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "📝 Creating .env.local from template..."
    cp env.development .env.local
    echo "✅ Created .env.local - Please update with your actual values"
else
    echo "✅ .env.local already exists"
fi

# Check if PostgreSQL is running
echo "🐘 Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL is installed"
    # Try to connect to default database
    if psql -h localhost -U postgres -d postgres -c "SELECT 1;" &> /dev/null; then
        echo "✅ PostgreSQL is running and accessible"
    else
        echo "⚠️  PostgreSQL is installed but not accessible"
        echo "   Please ensure PostgreSQL is running and accessible with user 'postgres'"
    fi
else
    echo "❌ PostgreSQL is not installed"
    echo "   Please install PostgreSQL: https://www.postgresql.org/download/"
fi

# Check if AWS CLI is installed
echo "☁️  Checking AWS CLI..."
if command -v aws &> /dev/null; then
    echo "✅ AWS CLI is installed"
    if aws sts get-caller-identity &> /dev/null; then
        echo "✅ AWS credentials are configured"
    else
        echo "⚠️  AWS CLI is installed but credentials not configured"
        echo "   Run: aws configure"
    fi
else
    echo "❌ AWS CLI is not installed"
    echo "   Please install AWS CLI: https://aws.amazon.com/cli/"
fi

# Check if Docker is installed (for local services)
echo "🐳 Checking Docker..."
if command -v docker &> /dev/null; then
    echo "✅ Docker is installed"
    if docker info &> /dev/null; then
        echo "✅ Docker is running"
    else
        echo "⚠️  Docker is installed but not running"
    fi
else
    echo "❌ Docker is not installed"
    echo "   Please install Docker: https://www.docker.com/get-started"
fi

echo ""
echo "🚀 Next Steps:"
echo "1. Update .env.local with your actual service credentials"
echo "2. Set up PostgreSQL database: createdb thefesta_dev"
echo "3. Run database migrations: npm run db:push"
echo "4. Start development servers: npm run dev"
echo ""
echo "📚 For detailed setup instructions, see README.md"
