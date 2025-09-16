# Network Documentation Generator - Docker Deployment

This guide explains how to deploy the Network Documentation Generator application using Docker.

## Prerequisites

- Docker (Docker Desktop for Mac/Windows or Docker Engine for Linux)
- Docker Compose (included with Docker Desktop)
- Git (for cloning the repository)

## Quick Start

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone https://github.com/JFC-Technology/networkapp.git
   cd networkapp
   ```

2. **Navigate to the deployment directory**:
   ```bash
   cd deployment_package
   ```

3. **Build and start the containers**:
   ```bash
   docker compose up --build -d
   ```

4. **Access the application**:
   - Frontend: http://localhost:3000
   - Backend API Docs: http://localhost:8001/docs

## Services

The application consists of three services:

1. **frontend** - React-based web interface
   - Port: 3000
   - Environment: Development
   - Hot-reload enabled

2. **backend** - FastAPI application
   - Port: 8001
   - Environment: Development
   - Auto-reload enabled
   - API documentation available at `/docs` and `/redoc`

3. **mongodb** - MongoDB database
   - Port: 27017 (internal to Docker network)
   - Data is persisted in a Docker volume

## Environment Variables

### Backend

Create a `.env` file in the `backend` directory with the following variables:

```env
MONGO_URL=mongodb://mongodb:27017
DB_NAME=cli_documentation
CORS_ORIGINS=http://localhost:3000
```

### Frontend

Create a `.env` file in the `frontend` directory with:

```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

## Managing the Application

### Start the application
```bash
docker compose up -d
```

### Stop the application
```bash
docker compose down
```

### View logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f [service_name]  # frontend, backend, or mongodb
```

### Rebuild a specific service
```bash
docker compose up -d --build [service_name]
```

## Development Workflow

### Making Changes
1. Make your code changes
2. Rebuild the affected service:
   ```bash
   docker compose up -d --build [service_name]
   ```

### Accessing the Database

From within the Docker network, you can connect to MongoDB using:
```
mongodb://mongodb:27017/cli_documentation
```

## Troubleshooting

### Port Conflicts
If you encounter port conflicts, check which process is using the port and either stop it or modify the ports in `docker-compose.yml`.

### Build Failures
If the build fails, check the error message and ensure all dependencies are correctly specified in the respective `requirements.txt` and `package.json` files.

### Data Persistence
MongoDB data is persisted in a Docker volume. To completely reset the database:

```bash
docker compose down -v
```

## Production Deployment

For production deployment, you should:
1. Set appropriate environment variables
2. Disable debug mode in the backend
3. Build the frontend for production
4. Consider using a reverse proxy like Nginx
5. Set up proper SSL/TLS certificates

## License

[Your License Information]
