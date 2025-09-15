# CLI Documentation Generator - Local Deployment Guide

## Overview
This CLI Documentation Generator automates network device documentation by connecting to devices via SSH, executing CLI commands, parsing outputs, and generating professional documentation.

## Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB (local or MongoDB Atlas)
- Network devices accessible via SSH

## Project Structure
```
cli-doc-generator/
├── backend/                 # FastAPI backend
│   ├── server.py           # Main API server
│   ├── services/           # Core services
│   ├── templates/          # Jinja2 templates
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Backend environment variables
├── frontend/               # React frontend
│   ├── src/               # React source code
│   ├── public/            # Static assets
│   ├── package.json       # Node dependencies
│   └── .env               # Frontend environment variables
└── deployment/
    ├── docker-compose.yml  # Docker setup
    └── setup.sh           # Quick setup script
```

## Quick Start

### 1. Backend Setup
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your MongoDB connection
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your backend URL
npm start
```

### 3. Database Setup
- Install MongoDB locally or use MongoDB Atlas
- Create database: `cli_documentation`
- Collections will be created automatically

## Environment Configuration

### Backend (.env)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=cli_documentation
CORS_ORIGINS=http://localhost:3000,http://192.168.1.100:3000
```

### Frontend (.env)
```
REACT_APP_BACKEND_URL=http://localhost:8001
```

## Network Device Testing

### 1. Network Access
- Deploy on a machine accessible to your network devices
- Use your machine's network IP instead of localhost
- Example: `REACT_APP_BACKEND_URL=http://192.168.1.100:8001`

### 2. Firewall Configuration
- Open port 8001 (backend) and 3000 (frontend)
- Allow SSH access from application to network devices

### 3. Device Credentials
- Add your real network device credentials through the web interface
- Test connectivity before executing commands

## Supported Device Types
- Arista EOS
- Cisco IOS/IOS-XE/NX-OS
- Extensible for other platforms

## Features
- ✅ Device management and SSH testing
- ✅ Template-based and custom command execution
- ✅ Real-time progress updates via WebSocket
- ✅ Intelligent output parsing (ntc-templates + custom)
- ✅ Automated Markdown documentation generation
- ✅ Professional web interface
- ✅ Mobile-responsive design

## API Endpoints
- `GET /api/` - Health check
- `POST /api/devices` - Add device
- `GET /api/devices` - List devices
- `POST /api/devices/{id}/test-connection` - Test SSH
- `POST /api/devices/{id}/execute` - Execute commands
- `POST /api/generate-documentation` - Generate docs

## Troubleshooting

### Common Issues
1. **MongoDB Connection**: Ensure MongoDB is running and accessible
2. **Device SSH**: Verify network connectivity and credentials
3. **Port Conflicts**: Change ports if 3000/8001 are in use
4. **CORS Errors**: Update CORS_ORIGINS in backend .env

### Logs
- Backend logs: Terminal where uvicorn is running
- Frontend logs: Browser console
- MongoDB logs: MongoDB installation directory

## Production Deployment
- Use nginx as reverse proxy
- Set up SSL certificates
- Use environment-specific configurations
- Consider Docker deployment for easier management

## Security Notes
- Store device credentials securely
- Use HTTPS in production
- Implement proper authentication if needed
- Restrict network access as appropriate

## Support
For issues or questions, refer to the original development chat or FastAPI/React documentation.