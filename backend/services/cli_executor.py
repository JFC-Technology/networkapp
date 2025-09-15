import asyncio
import logging
from typing import Dict, List, Optional
from netmiko import ConnectHandler
from netmiko.exceptions import NetmikoTimeoutException, NetmikoAuthenticationException

logger = logging.getLogger(__name__)

class CLIExecutor:
    """Handles CLI command execution on network devices using Netmiko"""
    
    def __init__(self):
        self.device_type_mapping = {
            "arista_eos": "arista_eos",
            "cisco_ios": "cisco_ios",
            "cisco_xe": "cisco_xe",
            "cisco_nxos": "cisco_nxos"
        }
    
    async def test_connection(
        self,
        device_ip: str,
        username: str,
        password: str,
        device_type: str,
        enable_password: Optional[str] = None
    ) -> Dict[str, str]:
        """Test connection to a network device"""
        
        device_params = {
            'device_type': self.device_type_mapping.get(device_type, device_type),
            'host': device_ip,
            'username': username,
            'password': password,
            'timeout': 10,
            'session_timeout': 60,
        }
        
        if enable_password:
            device_params['secret'] = enable_password
        
        try:
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self._test_connection_sync, device_params)
            return result
        except Exception as e:
            logger.error(f"Connection test failed for {device_ip}: {str(e)}")
            raise
    
    def _test_connection_sync(self, device_params: Dict) -> Dict[str, str]:
        """Synchronous connection test"""
        try:
            with ConnectHandler(**device_params) as connection:
                # Test basic connectivity with a simple command
                output = connection.send_command("show version", read_timeout=30)
                
                return {
                    "status": "success",
                    "device_type": connection.device_type,
                    "prompt": connection.find_prompt(),
                    "sample_output": output[:200] + "..." if len(output) > 200 else output
                }
        except NetmikoAuthenticationException as e:
            raise Exception(f"Authentication failed: {str(e)}")
        except NetmikoTimeoutException as e:
            raise Exception(f"Connection timeout: {str(e)}")
        except Exception as e:
            raise Exception(f"Connection failed: {str(e)}")
    
    async def execute_commands(
        self,
        device_ip: str,
        username: str,
        password: str,
        device_type: str,
        commands: List[str],
        enable_password: Optional[str] = None
    ) -> Dict[str, str]:
        """Execute a list of CLI commands on a network device"""
        
        device_params = {
            'device_type': self.device_type_mapping.get(device_type, device_type),
            'host': device_ip,
            'username': username,
            'password': password,
            'timeout': 20,
            'session_timeout': 300,
        }
        
        if enable_password:
            device_params['secret'] = enable_password
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, 
                self._execute_commands_sync, 
                device_params, 
                commands
            )
            return result
        except Exception as e:
            logger.error(f"Command execution failed for {device_ip}: {str(e)}")
            raise
    
    def _execute_commands_sync(self, device_params: Dict, commands: List[str]) -> Dict[str, str]:
        """Synchronous command execution"""
        outputs = {}
        
        try:
            with ConnectHandler(**device_params) as connection:
                logger.info(f"Connected to {device_params['host']}")
                
                # Enter enable mode if secret is provided
                if 'secret' in device_params:
                    connection.enable()
                
                for command in commands:
                    try:
                        logger.info(f"Executing command: {command}")
                        
                        # Handle different command types
                        if command.startswith("show"):
                            output = connection.send_command(command, read_timeout=60)
                        else:
                            # For configuration commands, use send_config_set
                            output = connection.send_command(command, read_timeout=60)
                        
                        outputs[command] = output
                        logger.info(f"Command '{command}' executed successfully")
                        
                    except Exception as cmd_error:
                        logger.error(f"Error executing command '{command}': {str(cmd_error)}")
                        outputs[command] = f"ERROR: {str(cmd_error)}"
                
                logger.info(f"All commands executed on {device_params['host']}")
                return outputs
                
        except NetmikoAuthenticationException as e:
            raise Exception(f"Authentication failed: {str(e)}")
        except NetmikoTimeoutException as e:
            raise Exception(f"Connection timeout: {str(e)}")
        except Exception as e:
            raise Exception(f"Execution failed: {str(e)}")