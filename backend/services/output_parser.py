import re
import logging
from typing import Dict, List, Any, Optional
from ntc_templates.parse import parse_output

logger = logging.getLogger(__name__)

class OutputParser:
    """Parses CLI command outputs into structured data"""
    
    def __init__(self):
        # Custom parsing patterns for common commands
        self.custom_patterns = {
            "show version": {
                "arista_eos": self._parse_arista_version,
                "cisco_ios": self._parse_cisco_version
            },
            "show ip interface brief": {
                "arista_eos": self._parse_ip_int_brief,
                "cisco_ios": self._parse_ip_int_brief
            },
            "show interfaces status": {
                "arista_eos": self._parse_interface_status
            }
        }
    
    async def parse_output(self, command: str, raw_output: str, device_type: str) -> Dict[str, Any]:
        """Parse command output using ntc-templates or custom parsers"""
        
        if not raw_output or raw_output.strip() == "":
            return {"error": "Empty output", "raw": raw_output}
        
        # Try ntc-templates first
        try:
            parsed_data = parse_output(
                platform=device_type,
                command=command,
                data=raw_output
            )
            
            if parsed_data:
                logger.info(f"Successfully parsed '{command}' using ntc-templates")
                return {
                    "parsed": parsed_data,
                    "parser": "ntc-templates",
                    "raw": raw_output
                }
        except Exception as e:
            logger.warning(f"ntc-templates parsing failed for '{command}': {str(e)}")
        
        # Try custom parsers
        if command in self.custom_patterns and device_type in self.custom_patterns[command]:
            try:
                custom_parser = self.custom_patterns[command][device_type]
                parsed_data = custom_parser(raw_output)
                
                logger.info(f"Successfully parsed '{command}' using custom parser")
                return {
                    "parsed": parsed_data,
                    "parser": "custom",
                    "raw": raw_output
                }
            except Exception as e:
                logger.warning(f"Custom parsing failed for '{command}': {str(e)}")
        
        # Return raw output if parsing fails
        logger.info(f"No parser available for '{command}', returning raw output")
        return {
            "parsed": None,
            "parser": "none", 
            "raw": raw_output
        }
    
    def _parse_arista_version(self, output: str) -> Dict[str, Any]:
        """Parse Arista EOS show version output"""
        version_info = {}
        
        # Extract software version
        version_match = re.search(r'Arista DCS-[\w-]+.*?running EOS version ([\d.]+)', output)
        if version_match:
            version_info['software_version'] = version_match.group(1)
        
        # Extract system MAC
        mac_match = re.search(r'System MAC address:\s+([a-fA-F0-9:]+)', output)
        if mac_match:
            version_info['system_mac'] = mac_match.group(1)
        
        # Extract hardware model
        hardware_match = re.search(r'Arista (DCS-[\w-]+)', output)
        if hardware_match:
            version_info['hardware_model'] = hardware_match.group(1)
        
        # Extract serial number
        serial_match = re.search(r'Serial number:\s+(\w+)', output)
        if serial_match:
            version_info['serial_number'] = serial_match.group(1)
        
        # Extract uptime
        uptime_match = re.search(r'Uptime:\s+(.+?)(?:\n|$)', output)
        if uptime_match:
            version_info['uptime'] = uptime_match.group(1).strip()
        
        return version_info
    
    def _parse_cisco_version(self, output: str) -> Dict[str, Any]:
        """Parse Cisco IOS show version output"""
        version_info = {}
        
        # Extract software version
        version_match = re.search(r'Cisco IOS.*Version\s+([\d.]+\w*)', output)
        if version_match:
            version_info['software_version'] = version_match.group(1)
        
        # Extract hostname
        hostname_match = re.search(r'(\S+)\s+uptime is', output)
        if hostname_match:
            version_info['hostname'] = hostname_match.group(1)
        
        # Extract uptime
        uptime_match = re.search(r'uptime is\s+(.+?)(?:\n|$)', output)
        if uptime_match:
            version_info['uptime'] = uptime_match.group(1).strip()
        
        # Extract model
        model_match = re.search(r'cisco\s+(\S+)\s+\(', output)
        if model_match:
            version_info['hardware_model'] = model_match.group(1)
        
        return version_info
    
    def _parse_ip_int_brief(self, output: str) -> List[Dict[str, str]]:
        """Parse show ip interface brief output"""
        interfaces = []
        
        # Skip header lines and parse interface data
        lines = output.split('\n')
        header_found = False
        
        for line in lines:
            line = line.strip()
            if not line or line.startswith('Interface'):
                header_found = True
                continue
            
            if not header_found:
                continue
            
            # Parse interface line
            parts = line.split()
            if len(parts) >= 4:
                interface = {
                    'interface': parts[0],
                    'ip_address': parts[1] if parts[1] != 'unassigned' else '',
                    'status': parts[2] if len(parts) > 2 else '',
                    'protocol': parts[3] if len(parts) > 3 else ''
                }
                interfaces.append(interface)
        
        return interfaces
    
    def _parse_interface_status(self, output: str) -> List[Dict[str, str]]:
        """Parse show interfaces status output (Arista)"""
        interfaces = []
        
        lines = output.split('\n')
        header_found = False
        
        for line in lines:
            line = line.strip()
            if not line or 'Port' in line and 'Name' in line:
                header_found = True
                continue
            
            if not header_found:
                continue
            
            # Parse interface status line
            parts = line.split()
            if len(parts) >= 4:
                interface = {
                    'port': parts[0],
                    'name': parts[1] if len(parts) > 1 else '',
                    'status': parts[2] if len(parts) > 2 else '',
                    'vlan': parts[3] if len(parts) > 3 else '',
                    'duplex': parts[4] if len(parts) > 4 else '',
                    'speed': parts[5] if len(parts) > 5 else '',
                    'type': ' '.join(parts[6:]) if len(parts) > 6 else ''
                }
                interfaces.append(interface)
        
        return interfaces