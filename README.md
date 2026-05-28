# Sederek Kasir Backend

Backend API untuk aplikasi POS Sederek Kasir menggunakan Express.js + PostgreSQL + TypeScript.

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- PostgreSQL v14+
- npm atau yarn

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env file dengan konfigurasi database Anda

# 4. Create PostgreSQL database
createdb sederek_kasir

# atau via psql:
psql -U postgres
CREATE DATABASE sederek_kasir;
\q

# 5. Run migrations
psql -U postgres -d sederek_kasir -f src/database/migrations/001_create_users_and_permissions.sql

# 6. Start development server
npm run dev
```

Server akan running di `http://localhost:5000`

## 📁 Project Structure

```
src/
├── config/          # Configuration files
├── middleware/      # Express middleware
├── routes/          # API routes
├── controllers/     # Request handlers
├── services/        # Business logic
├── utils/           # Utility functions
├── types/           # TypeScript types
├── database/        # Migrations & seeds
├── app.ts           # Express app setup
└── server.ts        # Server entry point
```

## 🔐 Default User

```
Username: admin
Password: admin123
Role: admin
```

## 📡 API Endpoints

Base URL: `http://localhost:5000/api/v1`

### Health Check
```bash
GET /health
```

### Authentication (Example)
```bash
GET /api/v1/auth/test
```

**Full API documentation:** See `BACKEND-DESIGN.md` dan `API-ENDPOINTS.md`

## 🗄️ Database

### Run Migrations
```bash
psql -U postgres -d sederek_kasir -f src/database/migrations/001_create_users_and_permissions.sql
```

### Reset Database
```bash
dropdb sederek_kasir
createdb sederek_kasir
psql -U postgres -d sederek_kasir -f src/database/migrations/001_create_users_and_permissions.sql
```

## 🧪 Testing API

### Using curl
```bash
# Health check
curl http://localhost:5000/health

# Auth test
curl http://localhost:5000/api/v1/auth/test
```

### Using Postman/Insomnia
Import collection from `API-ENDPOINTS.md`

## 📝 Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

## 🔧 Environment Variables

See `.env.example` for all available variables.

Key variables:
- `DB_HOST` - PostgreSQL host
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `JWT_SECRET` - JWT secret key
- `CORS_ORIGIN` - Frontend URL

## 📚 Documentation

- **API Design**: `BACKEND-DESIGN.md`
- **Quick Start**: `BACKEND-QUICKSTART.md`
- **API Reference**: `API-ENDPOINTS.md`

## 🐳 Docker (Optional)

```bash
# Coming soon
docker-compose up -d
```

## 🔥 Next Steps

1. ✅ Setup database
2. ✅ Run migrations
3. ⏳ Implement authentication endpoints
4. ⏳ Implement products CRUD
5. ⏳ Implement transactions
6. ⏳ Add validation
7. ⏳ Add tests

## 📞 Support

For issues and questions, please refer to the documentation files.

---

**Status**: 🟢 Ready for Development
