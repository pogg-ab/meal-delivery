#!/bin/bash

# Auth Service Production Deployment Script
# Run this on your server: mealsystem.besiratv.com

echo "🚀 Starting Auth Service Deployment..."

# Update system packages
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (if not already installed)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/auth-service
sudo chown -R $USER:$USER /var/www/auth-service

# Copy application files (upload your built application here)
echo "📋 Upload your application files to /var/www/auth-service/"
echo "Make sure to include:"
echo "  - dist/ folder"
echo "  - node_modules/"
echo "  - package.json"
echo "  - .env.production (as .env)"

# Install production dependencies
echo "📦 Installing production dependencies..."
cd /var/www/auth-service
npm ci --only=production

# Run database migrations
echo "🗄️ Running database migrations..."
npm run migration:run

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'auth-service',
    script: 'dist/main.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/var/log/auth-service/error.log',
    out_file: '/var/log/auth-service/out.log',
    log_file: '/var/log/auth-service/combined.log',
    time: true
  }]
};
EOF

# Create log directory
sudo mkdir -p /var/log/auth-service
sudo chown -R $USER:$USER /var/log/auth-service

# Start the application with PM2
echo "🚀 Starting application with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME
sudo systemctl enable pm2-$USER

# Setup Nginx (if not already configured)
echo "🌐 Setting up Nginx reverse proxy..."
sudo apt install -y nginx

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/auth-service << EOF
server {
    listen 80;
    server_name mealsystem.besiratv.com;

    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mealsystem.besiratv.com;

    # SSL configuration (update with your certificate paths)
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Handle auth endpoints
    location /auth {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
    }
}
EOF

# Enable the site
sudo ln -s /etc/nginx/sites-available/auth-service /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

echo "✅ Deployment completed!"
echo ""
echo "🔍 Check application status:"
echo "  pm2 status"
echo "  pm2 logs auth-service"
echo ""
echo "🌐 Test the service:"
echo "  curl https://mealsystem.besiratv.com/auth/me"
echo ""
echo "📊 Monitor logs:"
echo "  pm2 logs auth-service --lines 100"</content>
<parameter name="filePath">c:\Users\hp\meal-delivery\auth-service\deploy.sh