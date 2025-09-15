import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { 
  Network, 
  Plus, 
  Edit3, 
  Trash2, 
  TestTube, 
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react';
import axios from 'axios';
import { API } from '../App';
import { toast } from 'sonner';

function DeviceManager() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [testingDevice, setTestingDevice] = useState(null);
  const [showPasswords, setShowPasswords] = useState({});
  
  const [newDevice, setNewDevice] = useState({
    name: '',
    ip: '',
    device_type: 'arista_eos',
    username: '',
    password: '',
    enable_password: ''
  });

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/devices`);
      setDevices(response.data);
    } catch (error) {
      console.error('Error loading devices:', error);
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();
    
    if (!newDevice.name || !newDevice.ip || !newDevice.username || !newDevice.password) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const response = await axios.post(`${API}/devices`, newDevice);
      setDevices([...devices, response.data]);
      setNewDevice({
        name: '',
        ip: '',
        device_type: 'arista_eos',
        username: '',
        password: '',
        enable_password: ''
      });
      setIsAddDialogOpen(false);
      toast.success('Device added successfully');
    } catch (error) {
      console.error('Error adding device:', error);
      toast.error('Failed to add device');
    }
  };

  const handleDeleteDevice = async (deviceId, deviceName) => {
    if (!window.confirm(`Are you sure you want to delete ${deviceName}?`)) {
      return;
    }

    try {
      await axios.delete(`${API}/devices/${deviceId}`);
      setDevices(devices.filter(d => d.id !== deviceId));
      toast.success('Device deleted successfully');
    } catch (error) {
      console.error('Error deleting device:', error);
      toast.error('Failed to delete device');
    }
  };

  const handleTestConnection = async (device) => {
    setTestingDevice(device.id);
    
    try {
      const response = await axios.post(`${API}/devices/${device.id}/test-connection`);
      
      if (response.data.status === 'success') {
        toast.success(`Connection to ${device.name} successful!`);
      } else {
        toast.error(`Connection failed: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast.error('Connection test failed');
    } finally {
      setTestingDevice(null);
    }
  };

  const togglePasswordVisibility = (deviceId) => {
    setShowPasswords(prev => ({
      ...prev,
      [deviceId]: !prev[deviceId]
    }));
  };

  const getDeviceTypeColor = (deviceType) => {
    switch (deviceType.toLowerCase()) {
      case 'arista_eos':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'cisco_ios':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'cisco_xe':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'cisco_nxos':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading devices...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold gradient-text">Device Manager</h1>
              <p className="text-slate-600">Manage your network devices and connections</p>
            </div>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Device
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Device</DialogTitle>
                <DialogDescription>
                  Configure a new network device for CLI documentation
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddDevice} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Device Name *</Label>
                    <Input
                      id="name"
                      value={newDevice.name}
                      onChange={(e) => setNewDevice({...newDevice, name: e.target.value})}
                      placeholder="Switch-01"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="ip">IP Address *</Label>
                    <Input
                      id="ip"
                      value={newDevice.ip}
                      onChange={(e) => setNewDevice({...newDevice, ip: e.target.value})}
                      placeholder="192.168.1.100"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="device_type">Device Type</Label>
                  <Select 
                    value={newDevice.device_type} 
                    onValueChange={(value) => setNewDevice({...newDevice, device_type: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="arista_eos">Arista EOS</SelectItem>
                      <SelectItem value="cisco_ios">Cisco IOS</SelectItem>
                      <SelectItem value="cisco_xe">Cisco IOS-XE</SelectItem>
                      <SelectItem value="cisco_nxos">Cisco NX-OS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="username">Username *</Label>
                    <Input
                      id="username"
                      value={newDevice.username}
                      onChange={(e) => setNewDevice({...newDevice, username: e.target.value})}
                      placeholder="admin"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newDevice.password}
                      onChange={(e) => setNewDevice({...newDevice, password: e.target.value})}
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="enable_password">Enable Password (Optional)</Label>
                  <Input
                    id="enable_password"
                    type="password"
                    value={newDevice.enable_password}
                    onChange={(e) => setNewDevice({...newDevice, enable_password: e.target.value})}
                    placeholder="••••••••"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    Add Device
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Devices List */}
        {devices.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="text-center py-12">
              <Network className="w-16 h-16 mx-auto mb-4 text-slate-400" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">No Devices Configured</h3>
              <p className="text-slate-600 mb-6">Add your first network device to start generating documentation</p>
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Device
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device) => (
              <Card key={device.id} className="device-card">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold">{device.name}</CardTitle>
                      <CardDescription className="font-mono text-sm">{device.ip}</CardDescription>
                    </div>
                    <Badge className={getDeviceTypeColor(device.device_type)}>
                      {device.device_type.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <p className="text-slate-600 mb-1">Username: <span className="font-mono">{device.username}</span></p>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">Password:</span>
                        <span className="font-mono">
                          {showPasswords[device.id] ? device.password : '••••••••'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePasswordVisibility(device.id)}
                          className="p-1 h-6 w-6"
                        >
                          {showPasswords[device.id] ? 
                            <EyeOff className="w-3 h-3" /> : 
                            <Eye className="w-3 h-3" />
                          }
                        </Button>
                      </div>
                      {device.enable_password && (
                        <p className="text-slate-600">Enable Password: <span className="font-mono">••••••••</span></p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(device)}
                        disabled={testingDevice === device.id}
                        className="flex-1"
                      >
                        {testingDevice === device.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <TestTube className="w-3 h-3 mr-1" />
                        )}
                        Test
                      </Button>
                      
                      <Button
                        size="sm"
                        onClick={() => navigate(`/execute/${device.id}`)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                      >
                        Execute
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteDevice(device.id, device.name)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DeviceManager;