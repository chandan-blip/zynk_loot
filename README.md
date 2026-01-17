# Zynk Lottery System

A lottery platform with wallet management, P2P transfers, analytics, and rewards.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)

### Start All Services

```bash
# Start all containers (MySQL, Backend, Frontend, phpMyAdmin)
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop all containers
docker-compose -f docker-compose.dev.yml down
```

### Access Points
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **phpMyAdmin**: http://localhost:3305

### Default Credentials
- **Admin**: admin@zynk.com / admin123
- **MySQL**: zynk_user / zynkpassword

---

## Database Commands

### Fresh Start (Reset Everything)

```bash
# Stop containers and remove volumes
docker-compose -f docker-compose.dev.yml down -v

# Start fresh (will run init scripts)
docker-compose -f docker-compose.dev.yml up -d
```

### Reset MySQL Volume Only

```bash
# Stop containers
docker-compose -f docker-compose.dev.yml down

# Remove MySQL data volume
docker volume rm loot_mysql_data

# Start again (reinitializes database)
docker-compose -f docker-compose.dev.yml up -d
```

### Run Migrations

```bash
# Run a specific migration
docker exec -i zynk_mysql mysql -u zynk_user -pzynkpassword zynk_db < mysql/migrations/002-add-transfers.sql

# Or connect to MySQL and run manually
docker exec -it zynk_mysql mysql -u zynk_user -pzynkpassword zynk_db
```

### Backup Database

```bash
# Export database
docker exec zynk_mysql mysqldump -u zynk_user -pzynkpassword zynk_db > backup.sql

# Import database
docker exec -i zynk_mysql mysql -u zynk_user -pzynkpassword zynk_db < backup.sql
```

---

## Development Commands

### Restart Individual Services

```bash
# Restart backend only
docker-compose -f docker-compose.dev.yml restart backend

# Restart frontend only
docker-compose -f docker-compose.dev.yml restart frontend

# Restart MySQL only
docker-compose -f docker-compose.dev.yml restart mysql
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.dev.yml logs -f

# Backend only
docker-compose -f docker-compose.dev.yml logs -f backend

# MySQL only
docker-compose -f docker-compose.dev.yml logs -f mysql
```

### Rebuild Containers

```bash
# Rebuild after Dockerfile changes
docker-compose -f docker-compose.dev.yml up -d --build

# Rebuild specific service
docker-compose -f docker-compose.dev.yml up -d --build backend
```

---

## Local Development (Without Docker)

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_DATABASE=zynk_db
MYSQL_USER=zynk_user
MYSQL_PASSWORD=zynkpassword

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Environment
NODE_ENV=development
```

---

## Project Structure

```
loot/
├── backend/           # Express.js API
│   └── src/
│       ├── routes/    # API endpoints
│       ├── services/  # Business logic
│       ├── config/    # Database config
│       └── middleware/# Auth middleware
├── frontend/          # React + Vite
│   └── src/
│       ├── pages/     # Page components
│       ├── components/# Reusable components
│       ├── services/  # API calls
│       └── store/     # Zustand store
├── mysql/
│   ├── init/          # Initial schema (runs on first start)
│   └── migrations/    # Database migrations
└── docker-compose.dev.yml
```

---

## Troubleshooting

### Backend can't connect to MySQL

```bash
# Check if MySQL is healthy
docker-compose -f docker-compose.dev.yml ps

# Wait for MySQL to be ready, then restart backend
docker-compose -f docker-compose.dev.yml restart backend
```

### MySQL keeps crashing

```bash
# Check MySQL logs
docker-compose -f docker-compose.dev.yml logs mysql

# Reset with fresh volume
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
```

### Port already in use

```bash
# Check what's using the port
lsof -i :3000  # frontend
lsof -i :5000  # backend
lsof -i :3306  # mysql

# Kill the process or change ports in docker-compose.dev.yml
```

### Clear everything and start fresh

```bash
# Nuclear option - removes all containers, volumes, and images
docker-compose -f docker-compose.dev.yml down -v --rmi all
docker-compose -f docker-compose.dev.yml up -d --build
```
