import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  Network, 
  Server, 
  FileText, 
  Plus, 
  Activity, 
  Clock, 
  CheckCircle2,
  AlertCircle,
  Terminal,
  Router
} from 'lucide-react';
import axios from 'axios';
import { API } from '../App';
import { toast } from 'sonner';

function Dashboard() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState([]);
  const [recentExecutions, setRecentExecutions] = useState([]);
  const [stats, setStats] = useState({
    totalDevices: 0,
    activeConnections: 0,
    totalExecutions: 0,
    successRate: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load devices
      const devicesResponse = await axios.get(`${API}/devices`);
      const devicesList = devicesResponse.data;
      setDevices(devicesList);

      // Calculate stats
      const totalDevices = devicesList.length;
      
      // For now, we'll use mock data for recent executions and stats
      // In a real implementation, you'd fetch this from your API
      const mockStats = {
        totalDevices,
        activeConnections: Math.floor(totalDevices * 0.8),
        totalExecutions: 47,
        successRate: 94.5
      };
      
      setStats(mockStats);
      setRecentExecutions([
        {
          id: '1',
          deviceName: 'Switch-01',
          commands: ['show version', 'show interfaces'],
          status: 'completed',
          timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        },
        {
          id: '2',
          deviceName: 'Router-01',
          commands: ['show ip route'],
          status: 'running',
          timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString()
        }
      ]);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'running':
        return <Activity className="w-4 h-4 text-blue-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getDeviceTypeIcon = (deviceType) => {
    switch (deviceType.toLowerCase()) {
      case 'arista_eos':
        return <Network className="w-5 h-5 text-orange-600" />;
      case 'cisco_ios':
        return <Router className="w-5 h-5 text-blue-600" />;
      default:
        return <Server className="w-5 h-5 text-gray-600" />;
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now - time) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">
            CLI Documentation Generator
          </h1>
          <p className="text-slate-600 text-lg">
            Automate network device documentation with intelligent CLI parsing
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
              <Server className="h-4 w-4 text-slate-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{stats.totalDevices}</div>
              <p className="text-xs text-slate-600">Network devices managed</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">{stats.activeConnections}</div>
              <p className="text-xs text-slate-600">Devices online</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
              <Terminal className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">{stats.totalExecutions}</div>
              <p className="text-xs text-slate-600">Commands executed</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-700">{stats.successRate}%</div>
              <p className="text-xs text-slate-600">Execution success</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Devices */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="w-5 h-5 text-blue-600" />
                    Recent Devices
                  </CardTitle>
                  <CardDescription>Your recently added network devices</CardDescription>
                </div>
                <Button 
                  onClick={() => navigate('/devices')}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Device
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {devices.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No devices configured</p>
                    <Button 
                      onClick={() => navigate('/devices')}
                      className="mt-3 bg-blue-600 hover:bg-blue-700"
                    >
                      Add Your First Device
                    </Button>
                  </div>
                ) : (
                  devices.slice(0, 5).map((device) => (
                    <div key={device.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                      <div className="flex items-center gap-3">
                        {getDeviceTypeIcon(device.device_type)}
                        <div>
                          <p className="font-medium text-slate-900">{device.name}</p>
                          <p className="text-sm text-slate-600">{device.ip}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={`device-type-${device.device_type.replace('_', '-').toLowerCase()}`}
                        >
                          {device.device_type.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => navigate(`/execute/${device.id}`)}
                        >
                          Execute
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-600" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest command executions and events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentExecutions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No recent activity</p>
                  </div>
                ) : (
                  recentExecutions.map((execution) => (
                    <div key={execution.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                      <div className="mt-1">{getStatusIcon(execution.status)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900">{execution.deviceName}</p>
                        <p className="text-sm text-slate-600">
                          Executed: {execution.commands.join(', ')}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatTimeAgo(execution.timestamp)}
                        </p>
                      </div>
                      <Badge 
                        variant={execution.status === 'completed' ? 'default' : execution.status === 'running' ? 'secondary' : 'destructive'}
                        className="text-xs"
                      >
                        {execution.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button 
                  onClick={() => navigate('/devices')}
                  className="h-20 flex-col gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-6 h-6" />
                  Add New Device
                </Button>
                
                <Button 
                  onClick={() => navigate('/documentation')}
                  variant="outline"
                  className="h-20 flex-col gap-2 border-slate-300 hover:bg-slate-50"
                >
                  <FileText className="w-6 h-6" />
                  View Documentation
                </Button>
                
                <Button 
                  onClick={() => window.open('/api/docs', '_blank')}
                  variant="outline"
                  className="h-20 flex-col gap-2 border-slate-300 hover:bg-slate-50"
                >
                  <Terminal className="w-6 h-6" />
                  API Documentation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;