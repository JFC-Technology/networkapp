#!/bin/bash

echo "🚀 CLI Documentation Generator - Quick Setup"
echo "==========================================="

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

# Check MongoDB
if ! command -v mongod &> /dev/null; then
    echo "⚠️  MongoDB not found locally - you can use MongoDB Atlas instead"
fi

echo "✅ Prerequisites check complete"

# Create directory structure
echo "📁 Creating project structure..."
mkdir -p cli-doc-generator/{backend,frontend}
cd cli-doc-generator

# Setup backend
echo "🔧 Setting up backend..."
cd backend
cp ../../backend/* . -r 2>/dev/null || echo "Copy backend files manually"

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=cli_documentation
CORS_ORIGINS=http://localhost:3000
EOF
    echo "✅ Created backend .env file"
fi

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

cd ../frontend

# Copy frontend files
cp ../../frontend/* . -r 2>/dev/null || echo "Copy frontend files manually"

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << EOF
REACT_APP_BACKEND_URL=http://localhost:8001
EOF
    echo "✅ Created frontend .env file"
fi

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm install

cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Start MongoDB (if using local instance)"
echo "2. Start backend: cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload"
echo "3. Start frontend: cd frontend && npm start"
echo "4. Open http://localhost:3000 in your browser"
echo ""
echo "🌐 For network device testing:"
echo "- Update REACT_APP_BACKEND_URL in frontend/.env to use your network IP"
echo "- Update CORS_ORIGINS in backend/.env to include your network IP"
echo "- Example: http://192.168.1.100:8001"
echo ""
echo "📖 See README.md for detailed instructions"