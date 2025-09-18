#!/bin/bash

# ERP System Development Setup Script
echo "🚀 Setting up ERP System Development Environment..."

# Function to copy env template to .env
setup_env() {
    local service=$1
    local template_file="$service/env.template"
    local env_file="$service/.env"
    
    if [ -f "$template_file" ]; then
        if [ ! -f "$env_file" ]; then
            cp "$template_file" "$env_file"
            echo "✅ Created .env for $service"
        else
            echo "⚠️  .env already exists for $service"
        fi
    else
        echo "❌ Template file not found for $service"
    fi
}

# Setup environment files for all services
echo "📝 Setting up environment files..."
setup_env "auth-service"
setup_env "procurement"
setup_env "sales"
setup_env "stock-management"
setup_env "project-management"

# Install dependencies for all services
echo "📦 Installing dependencies..."
for service in auth-service procurement sales stock-management project-management; do
    echo "Installing dependencies for $service..."
    cd "$service"
    npm install
    cd ..
done

echo "🎉 Development environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Review and customize .env files if needed"
echo "2. Start the infrastructure: docker-compose up -d"
echo "3. Start individual services: npm run start:dev"
echo "4. Access services at:"
echo "   - Auth Service: http://localhost:3001"
echo "   - Procurement: http://localhost:3002"
echo "   - Sales: http://localhost:3003"
echo "   - Stock Management: http://localhost:3004"
echo "   - Project Management: http://localhost:3005" 