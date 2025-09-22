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
from typing import List, Dict, Optional, Any, AsyncIterator, Tuple
import uuid
from datetime import datetime, timezone
import paramiko
import threading
from services.cli_executor import CLIExecutor
from services.network_discovery import scan_subnet
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

# AI Runner models
class AIRunPlanStep(BaseModel):
    id: str
    description: str
    command: str

class AIRunPlanRequest(BaseModel):
    device_id: Optional[str] = None
    device_type: Optional[str] = None
    goal: str
    assume_sudo: bool = True

class AIRunPlanResponse(BaseModel):
    goal: str
    device_type: str
    steps: List[AIRunPlanStep]
    notes: Optional[str] = None

class AIChatRequest(BaseModel):
    message: str
    device_id: Optional[str] = None
    context_type: str = "smart"  # "smart", "full", "none"

class AIChatResponse(BaseModel):
    response: str
    context_used: bool = False

class SuggestionRequest(BaseModel):
    device_type: str
    vendor: Optional[str] = None
    model: Optional[str] = None
    os_version: Optional[str] = None
    role: Optional[str] = None  # access-switch, core, router, server, etc.
    goal: Optional[str] = None  # free text like "troubleshoot interface errors"

class SuggestionResponse(BaseModel):
    groups: Dict[str, List[str]]  # category -> commands
    notes: Optional[str] = None

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
        
        # Stream per-command progress
        raw_outputs: Dict[str, str] = {}
        device_params = {
            'device_type': cli_executor.device_type_mapping.get(device.device_type, device.device_type),
            'host': device.ip,
            'username': device.username,
            'password': device.password,
            'timeout': 20,
            'session_timeout': 300,
        }
        if device.enable_password:
            device_params['secret'] = device.enable_password

        for cmd in execution.commands:
            try:
                await websocket_manager.broadcast_to_client(
                    execution.device_id,
                    {"type": "execution_progress", "execution_id": execution.id, "command": cmd, "status": "started"}
                )
                output = await cli_executor.execute_single_command(device_params, cmd)
                raw_outputs[cmd] = output
                # Incremental DB update
                await db.command_executions.update_one(
                    {"id": execution.id},
                    {"$set": {f"raw_outputs.{cmd}": output}}
                )
                await websocket_manager.broadcast_to_client(
                    execution.device_id,
                    {"type": "execution_progress", "execution_id": execution.id, "command": cmd, "status": "completed", "output": output}
                )
            except Exception as cmd_e:
                err_text = f"ERROR: {str(cmd_e)}"
                raw_outputs[cmd] = err_text
                await db.command_executions.update_one(
                    {"id": execution.id},
                    {"$set": {f"raw_outputs.{cmd}": err_text}}
                )
                await websocket_manager.broadcast_to_client(
                    execution.device_id,
                    {"type": "execution_progress", "execution_id": execution.id, "command": cmd, "status": "error", "output": err_text}
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

# Network Discovery Endpoint
@api_router.get("/discover")
async def discover_network(cidr: str, ports: Optional[str] = None):
    """
    Discover active hosts on the given CIDR.
    - cidr: e.g. "192.168.1.0/24"
    - ports: optional comma-separated list of ports to probe (defaults to 22,80,443)
    """
    try:
        port_list: Optional[List[int]] = None
        if ports:
            try:
                port_list = [int(p.strip()) for p in ports.split(",") if p.strip()]
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid ports parameter")

        results = await scan_subnet(cidr, ports=port_list)
        return {"cidr": cidr, "count": len(results), "hosts": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Discovery failed")
        raise HTTPException(status_code=500, detail=str(e))

# Command Suggestions (AI-like rules)
def _dedupe_groups(groups: Dict[str, List[str]]) -> Dict[str, List[str]]:
    clean: Dict[str, List[str]] = {}
    for k, v in groups.items():
        seen = set()
        ordered: List[str] = []
        for cmd in v:
            c = (cmd or '').strip()
            if not c:
                continue
            if c not in seen:
                seen.add(c)
                ordered.append(c)
        if ordered:
            clean[k] = ordered
    return clean


def _format_prompt(req: SuggestionRequest) -> str:
    parts = [
        "You are a network automation expert. Suggest concise, safe, read-only CLI commands for the given context.",
        "Group suggestions by categories like inventory, interfaces, routing, layer2, system, logs, bgp, ospf, security, services.",
        "Return only commands, no explanations.",
        "Prefer show/read-only commands; avoid config mode unless explicitly asked.",
        f"device_type: {req.device_type}",
        f"vendor: {req.vendor}",
        f"model: {req.model}",
        f"os_version: {req.os_version}",
        f"role: {req.role}",
        f"goal: {req.goal}",
        "Output JSON with this schema: {\"groups\": {\"<category>\": [\"cmd\", ...]}}",
    ]
    return "\n".join([p for p in parts if p])


def _parse_llm_groups(raw_text: str) -> Dict[str, List[str]]:
    try:
        data = json.loads(raw_text)
        if isinstance(data, dict) and isinstance(data.get("groups"), dict):
            # normalize to lists of strings
            groups: Dict[str, List[str]] = {}
            for k, v in data["groups"].items():
                if isinstance(v, list):
                    groups[k] = [str(x) for x in v if str(x).strip()]
            return groups
    except Exception:
        pass
    # Fallback: treat each line as a command under "suggested"
    lines = [ln.strip(" -") for ln in raw_text.splitlines() if ln.strip()]
    return {"suggested": lines[:50]}


async def _call_openai_suggestions(req: SuggestionRequest) -> Optional[Dict[str, List[str]]]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    prompt = _format_prompt(req)
    def _do_call() -> Optional[Dict[str, List[str]]]:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            resp = client.responses.create(
                model=os.environ.get("OPENAI_MODEL", "gpt-5"),
                input=prompt,
                # Keep it lightweight
                reasoning={"effort": "low"}
            )
            text = getattr(resp, "output_text", None)
            if not text:
                # Aggregate text outputs from response.output if available
                # Safely concatenate any output_text-like chunks
                try:
                    chunks = []
                    for item in getattr(resp, "output", []) or []:
                        if isinstance(item, dict):
                            for c in item.get("content", []) or []:
                                if isinstance(c, dict) and c.get("type") in {"output_text", "text"}:
                                    if c.get("text"):
                                        chunks.append(c["text"])
                    text = "\n".join(chunks).strip()
                except Exception:
                    text = None
            if not text:
                return None
            return _parse_llm_groups(text)
        except Exception as e:
            logging.getLogger(__name__).warning(f"OpenAI suggestion call failed: {e}")
            return None
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _do_call)


@api_router.post("/suggest-commands", response_model=SuggestionResponse)
async def suggest_commands(req: SuggestionRequest):
    device_type = (req.device_type or "").lower()
    vendor = (req.vendor or "").lower()
    role = (req.role or "").lower()
    goal = (req.goal or "").lower()

    groups: Dict[str, List[str]] = {}

    def add(cat: str, cmds: List[str]):
        if not cmds:
            return
        groups.setdefault(cat, [])
        for c in cmds:
            if c not in groups[cat]:
                groups[cat].append(c)

    # Base templates by device_type (reusing existing template ideas)
    if device_type in {"arista_eos", "cisco_ios", "cisco_xe", "cisco_nxos"}:
        add("inventory", ["show version", "show running-config", "show interfaces status"])
        add("interfaces", ["show interfaces", "show ip interface brief"])  # IOS-like; EOS equivalent ok
        add("routing", ["show ip route", "show arp"])  
        add("system", ["show processes cpu", "show logging | last 50"])  

        if vendor == "arista" or device_type == "arista_eos":
            add("eos", ["show hostname", "show system environment all"])  
        if vendor in {"cisco", "cisco systems"} or device_type in {"cisco_ios", "cisco_xe", "cisco_nxos"}:
            add("cisco", ["show cdp neighbors", "show platform", "show ip protocols"])  

        if role in {"core", "distribution", "router"}:
            add("routing", ["show ip bgp summary", "show ip ospf neighbor", "show ip eigrp neighbors"])  
        if role in {"access-switch", "access", "edge"}:
            add("layer2", ["show spanning-tree", "show mac address-table", "show interfaces trunk", "show vlan brief"])  

    elif device_type == "server_ssh":
        add("system", ["uname -a", "lsb_release -a || cat /etc/os-release", "uptime", "whoami"])
        add("resources", ["df -h", "free -m", "top -b -n 1 | head -n 20"])  
        add("networking", ["ip addr", "ip route", "ss -tulpen || netstat -tulpen"])  
        add("logs", ["journalctl -xe --no-pager | tail -n 50", "dmesg | tail -n 50"])  
        if role in {"web", "api"}:
            add("services", ["systemctl status nginx || systemctl status httpd", "ss -tulpen | grep -E ':80|:443'"])  

    # Goal-driven refinements (very simple keyword rules)
    if goal:
        if any(k in goal for k in ["interface", "errors", "drops", "flap"]):
            add("troubleshoot", [
                "show interfaces counters errors",
                "show interfaces | include line protocol|error|drop",
                "show logging | include interface",
            ])
        if any(k in goal for k in ["bgp", "neighbor", "peering"]):
            add("bgp", ["show ip bgp summary", "show ip bgp neighbors", "show ip route bgp"])  
        if any(k in goal for k in ["ospf"]):
            add("ospf", ["show ip ospf neighbor", "show ip ospf database", "show ip route ospf"])  
        if any(k in goal for k in ["cpu", "memory", "load"]):
            add("system", ["show processes cpu sorted 5", "show processes memory sorted"])

    # Try OpenAI to enhance suggestions if API key is present
    llm_groups = await _call_openai_suggestions(req)
    if llm_groups:
        for cat, cmds in llm_groups.items():
            add(cat, cmds)

    groups = _dedupe_groups(groups)
    notes = "Suggestions generated by rules" + (" and OpenAI" if llm_groups else "") + "."
    return SuggestionResponse(groups=groups, notes=notes)

# AI Runner: Plan commands from goal
def _extract_json(text: str) -> Optional[dict]:
    try:
        return json.loads(text)
    except Exception:
        pass
    # Try to find a JSON object in the text
    try:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            snippet = text[start:end+1]
            return json.loads(snippet)
    except Exception:
        return None


def _fallback_plan_server(goal: str, assume_sudo: bool) -> List[AIRunPlanStep]:
    """Very simple goal->steps mapping for common server tasks (Debian/Ubuntu)."""
    g = (goal or "").lower()
    steps: List[AIRunPlanStep] = []
    sudo = "sudo " if assume_sudo else ""

    def add(i: int, desc: str, cmd: str):
        steps.append(AIRunPlanStep(id=f"s{i}", description=desc, command=cmd))

    # Always start with a quick OS identification to help users
    add(0, "Identify OS", "cat /etc/os-release || uname -a")

    if any(k in g for k in ["postgres", "postgresql"]):
        add(1, "Update package index", f"{sudo}apt-get update -y")
        add(2, "Install PostgreSQL server", f"{sudo}apt-get install -y postgresql")
        add(3, "Enable and start PostgreSQL", f"{sudo}systemctl enable --now postgresql")
        add(4, "Verify installation", "psql --version || postgres -V || /usr/lib/postgresql/*/bin/postgres -V")
        return steps

    if "nginx" in g:
        add(1, "Update package index", f"{sudo}apt-get update -y")
        add(2, "Install NGINX", f"{sudo}apt-get install -y nginx")
        add(3, "Enable and start NGINX", f"{sudo}systemctl enable --now nginx")
        add(4, "Verify NGINX status", f"{sudo}systemctl status --no-pager nginx | head -n 30")
        add(5, "Check HTTP port", "ss -tulpen | grep -E ':80|:443' || netstat -tulpen | grep -E ':80|:443'")
        return steps

    if "docker" in g:
        add(1, "Update package index", f"{sudo}apt-get update -y")
        add(2, "Install dependencies", f"{sudo}apt-get install -y ca-certificates curl gnupg")
        add(3, "Add Docker’s official GPG key", f"{sudo}install -m 0755 -d /etc/apt/keyrings && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | {sudo}gpg --dearmor -o /etc/apt/keyrings/docker.gpg")
        add(4, "Set up the repository", f"echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) stable\" | {sudo}tee /etc/apt/sources.list.d/docker.list > /dev/null")
        add(5, "Install Docker", f"{sudo}apt-get update -y && {sudo}apt-get install -y docker-ce docker-ce-cli containerd.io")
        add(6, "Enable and start Docker", f"{sudo}systemctl enable --now docker")
        add(7, "Verify Docker", "docker --version || sudo docker --version")
        return steps

    if any(k in g for k in ["node", "nodejs", "npm"]):
        add(1, "Install Node.js (using apt)", f"{sudo}apt-get update -y && {sudo}apt-get install -y nodejs npm")
        add(2, "Verify Node.js", "node -v && npm -v")
        return steps

    # Default fallback
    add(9, "No specific plan found; please refine the goal or enable OpenAI.", "echo 'No rule-based plan available'")
    return steps


@api_router.post("/ai/plan", response_model=AIRunPlanResponse)
async def ai_plan(request: AIRunPlanRequest):
    # Resolve device type if device_id provided
    resolved_device_type = (request.device_type or "").lower()
    if request.device_id and not resolved_device_type:
        device = await db.devices.find_one({"id": request.device_id})
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resolved_device_type = device.get("device_type", "").lower()

    if not resolved_device_type:
        raise HTTPException(status_code=400, detail="device_type or device_id required")

    # Try LLM plan first
    plan_steps: List[AIRunPlanStep] = []
    llm_text: Optional[str] = None
    try:
        api_key = os.environ.get("OPENAI_API_KEY")
        if api_key:
            from openai import OpenAI
            client = OpenAI(api_key=api_key)
            prompt = (
                "You are a system engineer. Plan a safe sequence of shell commands to achieve the goal on the given device type.\n"
                "- Return JSON ONLY with schema {\"steps\":[{\"id\":\"s1\",\"description\":\"...\",\"command\":\"...\"}]}\n"
                "- Prefer non-interactive commands.\n"
                "- Include verification commands where useful.\n"
                f"device_type: {resolved_device_type}\n"
                f"assume_sudo: {request.assume_sudo}\n"
                f"goal: {request.goal}\n"
            )
            resp = client.responses.create(
                model=os.environ.get("OPENAI_MODEL", "gpt-5"),
                input=prompt,
                reasoning={"effort": "low"}
            )
            llm_text = getattr(resp, "output_text", None)
            if not llm_text:
                try:
                    chunks = []
                    for item in getattr(resp, "output", []) or []:
                        if isinstance(item, dict):
                            for c in item.get("content", []) or []:
                                if isinstance(c, dict) and c.get("text"):
                                    chunks.append(c["text"])
                    llm_text = "\n".join(chunks).strip() or None
                except Exception:
                    llm_text = None
            if llm_text:
                data = _extract_json(llm_text) or {}
                for i, step in enumerate(data.get("steps", []), start=1):
                    plan_steps.append(AIRunPlanStep(
                        id=step.get("id") or f"s{i}",
                        description=step.get("description") or "",
                        command=step.get("command") or ""
                    ))
    except Exception as e:
        logger.warning(f"AI plan generation failed, falling back: {e}")

    # Fallback rules for common goals on server_ssh (attempt distro-aware plan if possible)
    if not plan_steps:
        if resolved_device_type == "server_ssh":
            # Try to detect remote distro to choose pkg manager
            pkg: str = "apt"
            try:
                if request.device_id:
                    device = await db.devices.find_one({"id": request.device_id})
                    if device:
                        device_params = {
                            'device_type': cli_executor.device_type_mapping.get(device.get('device_type'), device.get('device_type')),
                            'host': device.get('ip'),
                            'username': device.get('username'),
                            'password': device.get('password'),
                            'timeout': 15,
                            'session_timeout': 60,
                        }
                        if device.get('enable_password'):
                            device_params['secret'] = device.get('enable_password')
                        probe = await cli_executor.execute_single_command(device_params, "cat /etc/os-release || uname -a")
                        low = (probe or "").lower()
                        if any(x in low for x in ["id_like=debian", "ubuntu", "debian"]):
                            pkg = "apt"
                        elif any(x in low for x in ["rhel", "centos", "fedora", "id_like=rhel"]):
                            pkg = "dnf"  # prefer dnf on newer systems
                        elif "amzn" in low or "amazon linux" in low:
                            pkg = "yum"
                        elif "alpine" in low or "id=alpine" in low:
                            pkg = "apk"
                        elif any(x in low for x in ["arch", "manjaro"]):
                            pkg = "pacman"
            except Exception as probe_err:
                logger.warning(f"OS probe failed for AI plan: {probe_err}")

            sudo = "sudo " if request.assume_sudo else ""
            g = (request.goal or "").lower()

            def mk_steps(cmds: List[Tuple[str, str]]) -> List[AIRunPlanStep]:
                out: List[AIRunPlanStep] = []
                for i, (desc, cmd) in enumerate(cmds, start=1):
                    out.append(AIRunPlanStep(id=f"s{i}", description=desc, command=cmd))
                return out

            # Build plan per package manager
            if pkg == "apt":
                plan_steps = _fallback_plan_server(request.goal, request.assume_sudo)
            elif pkg in ("dnf", "yum"):
                cmds: List[Tuple[str, str]] = [("Identify OS", "cat /etc/os-release || uname -a")]
                if any(k in g for k in ["postgres", "postgresql"]):
                    cmds += [
                        ("Install PostgreSQL", f"{sudo}{pkg} install -y postgresql postgresql-server"),
                        ("Init DB (if needed)", f"{sudo}postgresql-setup --initdb || true"),
                        ("Enable and start", f"{sudo}systemctl enable --now postgresql || {sudo}systemctl enable --now postgresql.service"),
                        ("Verify", "psql --version || postgres -V"),
                    ]
                elif "nginx" in g:
                    cmds += [
                        ("Install NGINX", f"{sudo}{pkg} install -y nginx"),
                        ("Enable and start", f"{sudo}systemctl enable --now nginx"),
                        ("Verify", f"{sudo}systemctl status --no-pager nginx | head -n 30"),
                    ]
                elif "docker" in g:
                    # Simplified default repos path
                    cmds += [
                        ("Install Docker", f"{sudo}{pkg} install -y docker docker-cli containerd.io || {sudo}{pkg} install -y docker"),
                        ("Enable and start", f"{sudo}systemctl enable --now docker"),
                        ("Verify", "docker --version || sudo docker --version"),
                    ]
                elif any(k in g for k in ["node", "nodejs", "npm"]):
                    cmds += [
                        ("Install Node.js", f"{sudo}{pkg} install -y nodejs npm"),
                        ("Verify", "node -v && npm -v"),
                    ]
                else:
                    cmds += [("No specific plan", "echo 'No rule-based plan available'")]
                plan_steps = mk_steps(cmds)
            elif pkg == "apk":
                cmds: List[Tuple[str, str]] = [("Identify OS", "cat /etc/os-release || uname -a")]
                if any(k in g for k in ["postgres", "postgresql"]):
                    cmds += [
                        ("Update", f"{sudo}apk update"),
                        ("Install PostgreSQL", f"{sudo}apk add postgresql"),
                        ("Start service", f"{sudo}rc-service postgresql start || true"),
                        ("Verify", "psql --version || postgres -V"),
                    ]
                elif "nginx" in g:
                    cmds += [
                        ("Update", f"{sudo}apk update"),
                        ("Install NGINX", f"{sudo}apk add nginx"),
                        ("Start service", f"{sudo}rc-service nginx start || true"),
                    ]
                else:
                    cmds += [("No specific plan", "echo 'No rule-based plan available'")]
                plan_steps = mk_steps(cmds)
            elif pkg == "pacman":
                cmds: List[Tuple[str, str]] = [("Identify OS", "cat /etc/os-release || uname -a")]
                if any(k in g for k in ["postgres", "postgresql"]):
                    cmds += [
                        ("Sync packages", f"{sudo}pacman -Sy --noconfirm"),
                        ("Install PostgreSQL", f"{sudo}pacman -S --noconfirm postgresql"),
                        ("Start service", f"{sudo}systemctl enable --now postgresql"),
                        ("Verify", "psql --version || postgres -V"),
                    ]
                else:
                    cmds += [("No specific plan", "echo 'No rule-based plan available'")]
                plan_steps = mk_steps(cmds)
            else:
                plan_steps = _fallback_plan_server(request.goal, request.assume_sudo)
        else:
            # Generic safe fallback: no-op and echo guidance
            plan_steps = [
                AIRunPlanStep(id="s1", description="No rule-based plan for this device type; please use Suggestions tab.", command="echo 'No plan available'"),
            ]

    return AIRunPlanResponse(
        goal=request.goal,
        device_type=resolved_device_type,
        steps=plan_steps,
        notes=("Plan generated by OpenAI" if llm_text else "Plan generated by rules")
    )

# AI Chat endpoint for terminal assistance
@api_router.post("/ai/chat", response_model=AIChatResponse)
async def ai_chat(request: AIChatRequest):
    try:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return AIChatResponse(
                response="AI chat requires OpenAI API key. Please set OPENAI_API_KEY in your environment.",
                context_used=False
            )

        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        
        # Build system prompt for terminal assistance
        system_prompt = """You are a helpful terminal assistant. You help users with:
- Debugging command errors
- Explaining command output
- Suggesting next steps
- System administration tasks
- Troubleshooting issues

When given terminal context, analyze it carefully and provide:
1. Clear explanations of what's happening
2. Specific solutions for errors
3. Suggested commands to run next
4. Best practices and warnings

Be concise but thorough. Format commands in code blocks."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.message}
        ]

        response = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4"),
            messages=messages,
            max_tokens=1000,
            temperature=0.7
        )

        ai_response = response.choices[0].message.content
        
        return AIChatResponse(
            response=ai_response,
            context_used="Terminal Context:" in request.message
        )

    except Exception as e:
        logger.error(f"AI chat error: {e}")
        return AIChatResponse(
            response=f"Sorry, I encountered an error: {str(e)}",
            context_used=False
        )

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
        },
        "server_ssh": {
            "system": [
                "uname -a",
                "lsb_release -a || cat /etc/os-release",
                "uptime",
                "whoami"
            ],
            "resources": [
                "df -h",
                "free -m",
                "top -b -n 1 | head -n 20"
            ],
            "networking": [
                "ip addr",
                "ip route",
                "ss -tulpen || netstat -tulpen"
            ],
            "security": [
                "getenforce 2>/dev/null || echo 'SELinux not present'",
                "ufw status 2>/dev/null || echo 'UFW not present'",
                "sestatus 2>/dev/null || true"
            ]
        }
    }
    
    return templates.get(device_type, {})

@api_router.get("/")
async def root():
    return {"message": "CLI Documentation Generator API", "version": "1.0.0"}

# Include the router in the main app
app.include_router(api_router)

# Interactive SSH Terminal WebSocket (for server_ssh devices)
# Path: /api/ssh/{device_id}/terminal
@app.websocket("/api/ssh/{device_id}/terminal")
async def ssh_terminal(websocket: WebSocket, device_id: str):
    await websocket.accept()
    try:
        # Fetch device
        try:
            device = await db.devices.find_one({"id": device_id})
        except Exception as db_err:
            logger.exception("SSH terminal error: database unavailable while fetching device")
            try:
                await websocket.send_text("[error] database unavailable (devices). Ensure MongoDB is running.")
            except Exception:
                pass
            try:
                await websocket.close(code=1011)
            except Exception:
                pass
            return
        if not device:
            await websocket.send_text("[error] device not found")
            await websocket.close(code=4404)
            return
        if device.get("device_type") != "server_ssh":
            await websocket.send_text("[error] device is not server_ssh")
            await websocket.close(code=4403)
            return

        host = device.get("ip")
        username = device.get("username")
        password = device.get("password")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname=host, username=username, password=password, timeout=10)

        chan = client.invoke_shell(term='xterm')
        chan.settimeout(0.0)  # non-blocking

        loop = asyncio.get_event_loop()
        stop_event = threading.Event()

        def reader():
            try:
                while not stop_event.is_set():
                    try:
                        if chan.recv_ready():
                            data = chan.recv(4096)
                            if not data:
                                break
                            text = data.decode(errors='ignore')
                            asyncio.run_coroutine_threadsafe(websocket.send_text(text), loop)
                        else:
                            threading.Event().wait(0.02)
                    except Exception:
                        threading.Event().wait(0.02)
            finally:
                try:
                    asyncio.run_coroutine_threadsafe(websocket.close(), loop)
                except Exception:
                    pass

        t = threading.Thread(target=reader, daemon=True)
        t.start()

        try:
            while True:
                msg = await websocket.receive_text()
                # Try JSON control message first
                try:
                    obj = json.loads(msg)
                    mtype = obj.get("type")
                    if mtype == "input":
                        data = obj.get("data", "")
                        if data:
                            chan.send(data)
                    elif mtype == "resize":
                        cols = int(obj.get("cols", 80))
                        rows = int(obj.get("rows", 24))
                        try:
                            chan.resize_pty(width=cols, height=rows)
                        except Exception:
                            pass
                    else:
                        chan.send(msg)
                except Exception:
                    # Treat raw text as keystrokes
                    chan.send(msg)
        except WebSocketDisconnect:
            pass
        finally:
            stop_event.set()
            try:
                chan.close()
            except Exception:
                pass
            try:
                client.close()
            except Exception:
                pass
    except Exception as e:
        logger.exception("SSH terminal error")
        try:
            await websocket.send_text(f"[error] {str(e)}")
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass

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
