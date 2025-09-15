import requests
import sys
import json
from datetime import datetime

class CLIDocGeneratorAPITester:
    def __init__(self, base_url="https://cmdline-docify.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_device_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test API health check"""
        return self.run_test("Health Check", "GET", "api/", 200)

    def test_get_devices_empty(self):
        """Test getting devices when none exist"""
        return self.run_test("Get Devices (Empty)", "GET", "api/devices", 200)

    def test_create_device(self):
        """Test creating a new device"""
        device_data = {
            "name": "Test-Switch-01",
            "ip": "192.168.1.100",
            "device_type": "arista_eos",
            "username": "admin",
            "password": "test123"
        }
        success, response = self.run_test("Create Device", "POST", "api/devices", 200, device_data)
        if success and 'id' in response:
            self.created_device_id = response['id']
            print(f"   Created device ID: {self.created_device_id}")
        return success, response

    def test_get_devices_with_data(self):
        """Test getting devices when data exists"""
        return self.run_test("Get Devices (With Data)", "GET", "api/devices", 200)

    def test_get_device_by_id(self):
        """Test getting a specific device by ID"""
        if not self.created_device_id:
            print("❌ Skipped - No device ID available")
            return False, {}
        return self.run_test("Get Device by ID", "GET", f"api/devices/{self.created_device_id}", 200)

    def test_get_nonexistent_device(self):
        """Test getting a device that doesn't exist"""
        fake_id = "nonexistent-device-id"
        return self.run_test("Get Nonexistent Device", "GET", f"api/devices/{fake_id}", 404)

    def test_connection_test(self):
        """Test device connection (will fail as expected)"""
        if not self.created_device_id:
            print("❌ Skipped - No device ID available")
            return False, {}
        success, response = self.run_test("Test Connection", "POST", f"api/devices/{self.created_device_id}/test-connection", 200)
        # Connection should fail since we're using mock credentials
        if success and response.get('status') == 'failed':
            print("   ✅ Connection failed as expected (mock credentials)")
            return True, response
        return success, response

    def test_execute_commands(self):
        """Test command execution"""
        if not self.created_device_id:
            print("❌ Skipped - No device ID available")
            return False, {}
        
        command_data = {
            "commands": ["show version", "show hostname"]
        }
        return self.run_test("Execute Commands", "POST", f"api/devices/{self.created_device_id}/execute", 200, command_data)

    def test_get_command_templates(self):
        """Test getting command templates for device types"""
        success1, _ = self.run_test("Get Arista Templates", "GET", "api/command-templates/arista_eos", 200)
        success2, _ = self.run_test("Get Cisco Templates", "GET", "api/command-templates/cisco_ios", 200)
        success3, _ = self.run_test("Get Unknown Templates", "GET", "api/command-templates/unknown_device", 200)
        return success1 and success2 and success3, {}

    def test_delete_device(self):
        """Test deleting a device"""
        if not self.created_device_id:
            print("❌ Skipped - No device ID available")
            return False, {}
        return self.run_test("Delete Device", "DELETE", f"api/devices/{self.created_device_id}", 200)

    def test_delete_nonexistent_device(self):
        """Test deleting a device that doesn't exist"""
        fake_id = "nonexistent-device-id"
        return self.run_test("Delete Nonexistent Device", "DELETE", f"api/devices/{fake_id}", 404)

def main():
    print("🚀 Starting CLI Documentation Generator API Tests")
    print("=" * 60)
    
    tester = CLIDocGeneratorAPITester()
    
    # Run all tests in sequence
    test_methods = [
        tester.test_health_check,
        tester.test_get_devices_empty,
        tester.test_create_device,
        tester.test_get_devices_with_data,
        tester.test_get_device_by_id,
        tester.test_get_nonexistent_device,
        tester.test_connection_test,
        tester.test_execute_commands,
        tester.test_get_command_templates,
        tester.test_delete_device,
        tester.test_delete_nonexistent_device
    ]
    
    for test_method in test_methods:
        try:
            test_method()
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())