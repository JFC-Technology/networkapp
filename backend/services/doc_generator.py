import os
import logging
from pathlib import Path
from typing import Dict, Any, List
from jinja2 import Environment, FileSystemLoader, Template
from datetime import datetime

logger = logging.getLogger(__name__)

class DocumentationGenerator:
    """Generates documentation from parsed CLI outputs using Jinja2 templates"""
    
    def __init__(self):
        self.templates_dir = Path(__file__).parent.parent / "templates"
        self.templates_dir.mkdir(exist_ok=True)
        
        # Initialize Jinja2 environment
        self.env = Environment(
            loader=FileSystemLoader(str(self.templates_dir)),
            trim_blocks=True,
            lstrip_blocks=True
        )
        
        # Create default template if it doesn't exist
        self._create_default_template()
    
    def _create_default_template(self):
        """Create a default documentation template"""
        default_template_path = self.templates_dir / "default.md.j2"
        
        if not default_template_path.exists():
            template_content = '''# Network Device Documentation

## Device Information
- **Device Name**: {{ device_info.name }}
- **IP Address**: {{ device_info.ip }}
- **Device Type**: {{ device_info.device_type }}
- **Documentation Generated**: {{ generation_time }}

---

{% if parsed_data %}
{% for command, data in parsed_data.items() %}
## Command: `{{ command }}`

{% if data.parsed %}
{% if command == "show version" %}
### System Information
{% if data.parsed.software_version %}
- **Software Version**: {{ data.parsed.software_version }}
{% endif %}
{% if data.parsed.hardware_model %}
- **Hardware Model**: {{ data.parsed.hardware_model }}
{% endif %}
{% if data.parsed.serial_number %}
- **Serial Number**: {{ data.parsed.serial_number }}
{% endif %}
{% if data.parsed.system_mac %}
- **System MAC**: {{ data.parsed.system_mac }}
{% endif %}
{% if data.parsed.uptime %}
- **Uptime**: {{ data.parsed.uptime }}
{% endif %}
{% if data.parsed.hostname %}
- **Hostname**: {{ data.parsed.hostname }}
{% endif %}

{% elif command == "show ip interface brief" %}
### Interface Summary
| Interface | IP Address | Status | Protocol |
|-----------|------------|--------|----------|
{% for interface in data.parsed %}
| {{ interface.interface }} | {{ interface.ip_address or "unassigned" }} | {{ interface.status }} | {{ interface.protocol }} |
{% endfor %}

{% elif command == "show interfaces status" %}
### Interface Status
| Port | Name | Status | VLAN | Duplex | Speed | Type |
|------|------|--------|------|--------|-------|------|
{% for interface in data.parsed %}
| {{ interface.port }} | {{ interface.name }} | {{ interface.status }} | {{ interface.vlan }} | {{ interface.duplex }} | {{ interface.speed }} | {{ interface.type }} |
{% endfor %}

{% else %}
### Parsed Output
```json
{{ data.parsed | tojson(indent=2) }}
```
{% endif %}

{% else %}
### Raw Output
```
{{ data.raw }}
```
{% endif %}

---
{% endfor %}
{% else %}
*No command output data available*
{% endif %}

## Notes
- This documentation was automatically generated from CLI command outputs
- Parsed data is formatted when possible, otherwise raw output is shown
- Generated on {{ generation_time }}
'''
            
            with open(default_template_path, 'w') as f:
                f.write(template_content)
            
            logger.info(f"Created default template at {default_template_path}")
    
    async def generate_documentation(
        self,
        device_info: Any,
        parsed_data: Dict[str, Any],
        template_name: str = "default"
    ) -> str:
        """Generate documentation from parsed data using specified template"""
        
        try:
            # Load template
            template_file = f"{template_name}.md.j2"
            template = self.env.get_template(template_file)
            
            # Prepare context data
            context = {
                "device_info": device_info,
                "parsed_data": parsed_data,
                "generation_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "template_name": template_name
            }
            
            # Render documentation
            documentation = template.render(**context)
            
            logger.info(f"Documentation generated successfully using template '{template_name}'")
            return documentation
            
        except Exception as e:
            logger.error(f"Documentation generation failed: {str(e)}")
            
            # Fallback to simple text format
            fallback_doc = self._generate_fallback_documentation(device_info, parsed_data)
            return fallback_doc
    
    def _generate_fallback_documentation(self, device_info: Any, parsed_data: Dict[str, Any]) -> str:
        """Generate basic documentation when template rendering fails"""
        
        doc_lines = [
            "# Network Device Documentation (Fallback)",
            "",
            f"**Device**: {device_info.name}",
            f"**IP**: {device_info.ip}",
            f"**Type**: {device_info.device_type}",
            f"**Generated**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}",
            "",
            "---",
            ""
        ]
        
        for command, data in parsed_data.items():
            doc_lines.extend([
                f"## Command: `{command}`",
                "",
                "```",
                str(data.get('raw', 'No output available')),
                "```",
                "",
                "---",
                ""
            ])
        
        return "\n".join(doc_lines)
    
    def list_templates(self) -> List[str]:
        """List available documentation templates"""
        templates = []
        
        for template_file in self.templates_dir.glob("*.md.j2"):
            template_name = template_file.stem
            templates.append(template_name)
        
        return templates
    
    async def create_custom_template(self, template_name: str, template_content: str) -> str:
        """Create a custom documentation template"""
        
        template_path = self.templates_dir / f"{template_name}.md.j2"
        
        with open(template_path, 'w') as f:
            f.write(template_content)
        
        logger.info(f"Created custom template '{template_name}' at {template_path}")
        return str(template_path)