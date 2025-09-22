import asyncio
import platform
import socket
import subprocess
from dataclasses import dataclass, asdict
from ipaddress import ip_network, IPv4Network
from typing import List, Dict, Any, Optional


@dataclass
class HostInfo:
    ip: str
    hostname: Optional[str]
    mac: Optional[str]
    open_ports: List[int]
    is_ssh: bool
    banner: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


async def ping_host(ip: str, timeout: float = 1.0) -> bool:
    """Ping a host using the system ping command (works on macOS/Linux)."""
    count_flag = "-c" if platform.system().lower() != "windows" else "-n"
    timeout_flag = "-W" if platform.system().lower() != "darwin" else "-t"
    # On macOS, -W is not available; -t sets TTL, so rely on default timeout.
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", count_flag, "1", ip,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return False
        return proc.returncode == 0
    except FileNotFoundError:
        # Fallback: try TCP connect to 22 as a reachability proxy
        try:
            fut = asyncio.get_event_loop().run_in_executor(None, _tcp_connect, ip, 22, timeout)
            return await asyncio.wait_for(fut, timeout=timeout)
        except Exception:
            return False


def _tcp_connect(ip: str, port: int, timeout: float) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        try:
            s.connect((ip, port))
            return True
        except Exception:
            return False


def _tcp_banner(ip: str, port: int, timeout: float = 1.0) -> Optional[str]:
    try:
        with socket.create_connection((ip, port), timeout=timeout) as s:
            s.settimeout(timeout)
            try:
                data = s.recv(128)
                return data.decode(errors="ignore").strip() if data else None
            except Exception:
                return None
    except Exception:
        return None


def _get_mac_via_arp(ip: str) -> Optional[str]:
    try:
        output = subprocess.check_output(["arp", "-a", ip], stderr=subprocess.DEVNULL, text=True)
        # Typical macOS line: ? (192.168.1.10) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
        import re
        m = re.search(r"at\s+([0-9a-fA-F:]{17})", output)
        if m:
            return m.group(1).lower()
    except Exception:
        pass
    return None


async def scan_subnet(cidr: str, ports: List[int] | None = None, concurrency: int = 256) -> List[Dict[str, Any]]:
    ports = ports or [22, 80, 443]
    network = ip_network(cidr, strict=False)
    if isinstance(network, IPv4Network):
        hosts = [str(ip) for ip in network.hosts()]
    else:
        raise ValueError("Only IPv4 subnets are supported")

    sem = asyncio.Semaphore(concurrency)

    async def scan_ip(ip: str) -> Optional[Dict[str, Any]]:
        async with sem:
            alive = await ping_host(ip, timeout=1.0)
            if not alive:
                return None

            # Resolve hostname (non-blocking via executor)
            loop = asyncio.get_event_loop()
            try:
                hostname = await loop.run_in_executor(None, socket.getfqdn, ip)
            except Exception:
                hostname = None

            # Check ports quickly
            open_ports: List[int] = []
            for p in ports:
                ok = await loop.run_in_executor(None, _tcp_connect, ip, p, 0.5)
                if ok:
                    open_ports.append(p)

            banner = _tcp_banner(ip, 22, timeout=0.8) if 22 in open_ports else None
            mac = await loop.run_in_executor(None, _get_mac_via_arp, ip)

            info = HostInfo(
                ip=ip,
                hostname=hostname if hostname and hostname != ip else None,
                mac=mac,
                open_ports=open_ports,
                is_ssh=(22 in open_ports),
                banner=banner,
            )
            return info.to_dict()

    tasks = [asyncio.create_task(scan_ip(ip)) for ip in hosts]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r]
