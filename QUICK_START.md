# 🚀 Quick Start Guide

## Prerequisites
- Docker and Docker Compose installed
- Node.js 18+ installed
- Git installed

## ⚡ 5-Minute Setup

### 1. Clone and Navigate
```bash
cd ERP-system
```

### 2. Setup Environment Files
```bash
# Copy environment templates to .env files
cp auth-service/env.template auth-service/.env
cp procurement/env.template procurement/.env
cp sales/env.template sales/.env
cp stock-management/env.template stock-management/.env
cp project-management/env.template project-management/.env
```

### 3. Install Dependencies
```bash
# Install dependencies for all services
for service in auth-service procurement sales stock-management project-management; do
    cd $service && npm install && cd ..
done
```

### 4. Start Infrastructure
```bash
# Start databases, Kafka, and Zookeeper
docker-compose up -d
```

### 5. Start Services
```bash
# Start auth service (Terminal 1)
cd auth-service && npm run start:dev

# Start procurement service (Terminal 2)
cd procurement && npm run start:dev

# Start sales service (Terminal 3)
cd sales && npm run start:dev

# Start stock management service (Terminal 4)
cd stock-management && npm run start:dev

# Start project management service (Terminal 5)
cd project-management && npm run start:dev
```

## 🎯 Verify Setup

### Check Services
- Auth Service: http://localhost:3001
- Procurement: http://localhost:3002
- Sales: http://localhost:3003
- Stock Management: http://localhost:3004
- Project Management: http://localhost:3005

### Check Infrastructure
```bash
# View running containers
docker-compose ps

# Check logs
docker-compose logs -f
```

## 🛠️ Development Workflow

### 1. Make Changes
- Edit source files in `src/` directories
- Services auto-reload on changes

### 2. Test Changes
```bash
# Run tests for a service
cd auth-service && npm run test

# Run tests with coverage
npm run test:cov
```

### 3. Build for Production
```bash
# Build a service
cd auth-service && npm run build

# Build all services
for service in auth-service procurement sales stock-management project-management; do
    cd $service && npm run build && cd ..
done
```

## 🔧 Useful Commands

### Docker Management
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f [service-name]

# Restart a service
docker-compose restart [service-name]
```

### Database Access
```bash
# Access auth database
docker exec -it auth-service-db psql -U postgres -d auth_service

# Access procurement database
docker exec -it procurement-db psql -U postgres -d procurement
```

### Development
```bash
# Install new dependencies
cd [service-name] && npm install [package-name]

# Run linting
npm run lint

# Format code
npm run format
```

## 🚨 Troubleshooting

### Port Already in Use
```bash
# Check what's using a port (Windows)
netstat -an | findstr :3001

# Kill process using port (Windows)
taskkill /PID [PID] /F
```

### Database Connection Issues
```bash
# Check if database is running
docker-compose ps | grep db

# Restart database
docker-compose restart [service-name]-db
```

### Service Won't Start
```bash
# Check logs
docker-compose logs [service-name]

# Rebuild service
docker-compose build [service-name]
```

## 📚 Next Steps

1. **Read the Development Roadmap**: `DEVELOPMENT_ROADMAP.md`
2. **Start with Auth Service**: Complete user management
3. **Add Business Logic**: Implement core ERP features
4. **Test Everything**: Write comprehensive tests
5. **Deploy**: Prepare for production deployment

## 🆘 Need Help?

- Check the `DEVELOPMENT_ROADMAP.md` for detailed guidance
- Review service-specific README files
- Check Docker logs for error messages
- Ensure all environment variables are set correctly 