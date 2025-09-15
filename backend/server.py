from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import os
import logging
import json
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, AsyncIterator
import uuid
from datetime import datetime, timezone
from services.cli_executor import CLIExecutor
from services.output_parser import OutputParser
from services.doc_generator import DocumentationGenerator
from services.websocket_manager import WebSocketManager

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database configuration
mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

# Initialize MongoDB client
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[db_name]

# Initialize services
cli_executor = CLIExecutor()
output_parser = OutputParser()
doc_generator = DocumentationGenerator()
websocket_manager = WebSocketManager()

# Lifespan manager for FastAPI
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Store the database client in app state for cleanup
    app.state.mongo_client = mongo_client
    yield  # This is where the application runs
    
    # Shutdown: Close MongoDB client
    if hasattr(app.state, 'mongo_client'):
        app.state.mongo_client.close()

# Create the main app with lifespan manager
app = FastAPI(
    title="CLI Documentation Generator",
    version="1.0.0",
    lifespan=lifespan
)

# Dependency for FastAPI routes
async def get_db_dependency():
    return db

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Models
class Device(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    ip: str
    device_type: str
    username: str
    password: str  # In production, this should be encrypted
    enable_password: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceCreate(BaseModel):
    name: str
    ip: str
    device_type: str
    username: str
    password: str
    enable_password: Optional[str] = None

class CommandExecution(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str
    commands: List[str]
    status: str = "pending"  # pending, running, completed, failed
    raw_outputs: Dict[str, str] = {}
    parsed_outputs: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None

class DocumentationRequest(BaseModel):
    device_id: str
    commands: List[str]
    template_name: str = "default"

class DocumentGeneration(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str
    execution_id: str
    template_name: str
    documentation: str
    format: str = "markdown"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# WebSocket endpoint for real-time updates
@app.websocket("/api/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket_manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle any client messages if needed
    except WebSocketDisconnect:
        websocket_manager.disconnect(client_id)

# Device Management Endpoints
@api_router.get("/devices", response_model=List[Device])
async def get_devices():
    devices = await db.devices.find().to_list(1000)
    return [Device(**device) for device in devices]

@api_router.post("/devices", response_model=Device)
async def create_device(device: DeviceCreate):
    device_dict = device.dict()
    device_obj = Device(**device_dict)
    await db.devices.insert_one(device_obj.dict())
    return device_obj

@api_router.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: str):
    device = await db.devices.find_one({"id": device_id})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return Device(**device)

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str):
    result = await db.devices.delete_one({"id": device_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device deleted successfully"}

# Command Execution Endpoints
@api_router.post("/devices/{device_id}/test-connection")
async def test_device_connection(device_id: str):
    device = await db.devices.find_one({"id": device_id})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    device_obj = Device(**device)
    
    try:
        result = await cli_executor.test_connection(
            device_obj.ip,
            device_obj.username,
            device_obj.password,
            device_obj.device_type,
            device_obj.enable_password
        )
        return {"status": "success", "message": "Connection successful", "details": result}
    except Exception as e:
        return {"status": "failed", "message": str(e)}

@api_router.post("/devices/{device_id}/execute", response_model=CommandExecution)
async def execute_commands(device_id: str, request: Dict[str, List[str]]):
    device = await db.devices.find_one({"id": device_id})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    device_obj = Device(**device)
    commands = request.get("commands", [])
    
    execution = CommandExecution(
        device_id=device_id,
        commands=commands,
        status="running"
    )
    
    await db.command_executions.insert_one(execution.dict())
    
    # Execute commands asynchronously
    asyncio.create_task(execute_commands_background(execution, device_obj))
    
    return execution

async def execute_commands_background(execution: CommandExecution, device: Device):
    try:
        # Notify clients that execution started
        await websocket_manager.broadcast_to_client(
            execution.device_id,
            {"type": "execution_started", "execution_id": execution.id}
        )
        
        # Execute commands
        raw_outputs = await cli_executor.execute_commands(
            device.ip,
            device.username,
            device.password,
            device.device_type,
            execution.commands,
            device.enable_password
        )
        
        # Parse outputs
        parsed_outputs = {}
        for command, raw_output in raw_outputs.items():
            try:
                parsed_output = await output_parser.parse_output(command, raw_output, device.device_type)
                parsed_outputs[command] = parsed_output
            except Exception as parse_error:
                parsed_outputs[command] = {"error": str(parse_error), "raw": raw_output}
        
        # Update execution record
        execution.status = "completed"
        execution.raw_outputs = raw_outputs
        execution.parsed_outputs = parsed_outputs
        execution.completed_at = datetime.now(timezone.utc)
        
        await db.command_executions.update_one(
            {"id": execution.id},
            {"$set": execution.dict()}
        )
        
        # Notify clients of completion
        await websocket_manager.broadcast_to_client(
            execution.device_id,
            {
                "type": "execution_completed",
                "execution_id": execution.id,
                "results": parsed_outputs
            }
        )
        
    except Exception as e:
        execution.status = "failed"
        execution.completed_at = datetime.now(timezone.utc)
        
        await db.command_executions.update_one(
            {"id": execution.id},
            {"$set": {"status": "failed", "completed_at": execution.completed_at.isoformat()}}
        )
        
        await websocket_manager.broadcast_to_client(
            execution.device_id,
            {"type": "execution_failed", "execution_id": execution.id, "error": str(e)}
        )

@api_router.get("/executions/{execution_id}", response_model=CommandExecution)
async def get_execution(execution_id: str):
    execution = await db.command_executions.find_one({"id": execution_id})
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return CommandExecution(**execution)

@api_router.get("/devices/{device_id}/executions", response_model=List[CommandExecution])
async def get_device_executions(device_id: str):
    executions = await db.command_executions.find({"device_id": device_id}).sort("created_at", -1).to_list(100)
    return [CommandExecution(**execution) for execution in executions]

# Documentation Generation Endpoints
@api_router.post("/generate-documentation")
async def generate_documentation(request: DocumentationRequest):
    # Get device info
    device = await db.devices.find_one({"id": request.device_id})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Execute commands if needed or get latest execution
    execution_filter = {"device_id": request.device_id, "status": "completed"}
    latest_execution = await db.command_executions.find_one(execution_filter, sort=[("created_at", -1)])
    
    if not latest_execution:
        raise HTTPException(status_code=404, detail="No completed executions found for this device")
    
    # Generate documentation
    doc_content = await doc_generator.generate_documentation(
        device_info=Device(**device),
        parsed_data=latest_execution["parsed_outputs"],
        template_name=request.template_name
    )
    
    # Save documentation
    doc_generation = DocumentGeneration(
        device_id=request.device_id,
        execution_id=latest_execution["id"],
        template_name=request.template_name,
        documentation=doc_content
    )
    
    await db.documentation.insert_one(doc_generation.dict())
    
    return doc_generation

@api_router.get("/documentation/{doc_id}")
async def download_documentation(doc_id: str):
    doc = await db.documentation.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Documentation not found")
    
    return StreamingResponse(
        iter([doc["documentation"]]),
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=documentation_{doc_id}.md"}
    )

# Command Templates
@api_router.get("/command-templates/{device_type}")
async def get_command_templates(device_type: str):
    templates = {
        "arista_eos": {
            "basic_info": [
                "show version",
                "show hostname",
                "show running-config"
            ],
            "interfaces": [
                "show interfaces",
                "show interfaces status",
                "show ip interface brief"
            ],
            "routing": [
                "show ip route",
                "show ip route summary",
                "show arp"
            ],
            "system": [
                "show processes top",
                "show system environment all",
                "show logging"
            ]
        },
        "cisco_ios": {
            "basic_info": [
                "show version",
                "show running-config",
                "show startup-config"
            ],
            "interfaces": [
                "show interfaces",
                "show ip interface brief",
                "show interfaces status"
            ],
            "routing": [
                "show ip route",
                "show arp",
                "show cdp neighbors"
            ]
        }
    }
    
    return templates.get(device_type, {})

@api_router.get("/")
async def root():
    return {"message": "CLI Documentation Generator API", "version": "1.0.0"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
