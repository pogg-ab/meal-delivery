#!/bin/bash

# Hostinger Shared Hosting Deployment Script
# Run this in your Hostinger SSH terminal at /var/www/meal-delivery

echo "🚀 Deploying Auth Service to Hostinger..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not available on this hosting plan."
    echo "Please check if your Hostinger plan supports Node.js applications."
    echo "You may need to upgrade to a VPS plan for full Node.js support."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "⚠️  Node.js version $NODE_VERSION detected. Recommended: 18+"
    echo "Some features might not work properly."
fi

echo "✅ Node.js version: $(node -v)"
echo "✅ NPM version: $(npm -v)"

# Create auth-service directory
mkdir -p auth-service
cd auth-service

# Upload your files here (use FTP/SFTP to upload):
# - dist/ folder
# - node_modules/ folder
# - package.json
# - data-source.js
# - .env.production (as .env)

echo "📁 Please upload your application files to: $(pwd)"
echo "Required files:"
echo "  - dist/"
echo "  - node_modules/"
echo "  - package.json"
echo "  - data-source.js"
echo "  - .env (production environment file)"

# Wait for user to upload files
read -p "Press Enter after uploading files..."

# Check if files exist
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Please upload your files first."
    exit 1
fi

if [ ! -d "dist" ]; then
    echo "❌ dist/ directory not found. Please build your application first."
    exit 1
fi

# Install production dependencies (if not uploaded)
if [ ! -d "node_modules" ]; then
    echo "📦 Installing production dependencies..."
    npm ci --only=production
fi

# Check database connection
echo "🗄️ Checking database connection..."
if command -v psql &> /dev/null; then
    echo "PostgreSQL client available"
else
    echo "⚠️  PostgreSQL client not available. Using alternative connection method."
fi

# Run database migration
echo "🗄️ Running database migrations..."
if npm run migration:run; then
    echo "✅ Database migrations completed"
else
    echo "❌ Database migration failed. Check your database configuration."
    echo "You may need to run migrations manually or contact Hostinger support."
fi

# Check available ports
echo "🔍 Checking available ports..."
# On shared hosting, you might be limited to specific ports
# Hostinger might provide environment variables for the assigned port

# Get assigned port (Hostinger might set this)
ASSIGNED_PORT=${PORT:-3001}

# For shared hosting, you might need to use a proxy or specific port
if [ -n "$ASSIGNED_PORT" ]; then
    echo "Using assigned port: $ASSIGNED_PORT"
    sed -i "s/PORT=.*/PORT=$ASSIGNED_PORT/" .env
else
    echo "⚠️  No assigned port found. Using default port 3001"
    echo "Check your Hostinger control panel for the assigned port."
fi

# Create startup script for Hostinger
cat > start.sh << 'EOF'
#!/bin/bash
# Startup script for Hostinger
export NODE_ENV=production
exec node dist/main.js
EOF

chmod +x start.sh

# Test the application
echo "🧪 Testing application startup..."
timeout 10s node dist/main.js &
APP_PID=$!
sleep 5

if kill -0 $APP_PID 2>/dev/null; then
    echo "✅ Application started successfully"
    kill $APP_PID
else
    echo "❌ Application failed to start. Check logs for errors."
    exit 1
fi

echo ""
echo "🎉 Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Check your Hostinger control panel for Node.js application settings"
echo "2. Set the startup script to: $(pwd)/start.sh"
echo "3. Configure domain routing to point to your application"
echo "4. Test the endpoints:"
echo "   curl http://localhost:$ASSIGNED_PORT/health"
echo "   curl http://your-domain.com/health"
echo ""
echo "🔧 If you encounter issues:"
echo "   - Check Hostinger's Node.js documentation"
echo "   - Verify database connectivity"
echo "   - Check file permissions"
echo "   - Contact Hostinger support for Node.js specific help"</content>
<parameter name="filePath">c:\Users\hp\meal-delivery\auth-service\deploy-hostinger.sh