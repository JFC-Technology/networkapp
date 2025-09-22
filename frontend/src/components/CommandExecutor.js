import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  ArrowLeft, 
  Play, 
  Square, 
  Download, 
  RefreshCw,
  Terminal,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wand2,
  Loader2
} from 'lucide-react';
import axios from 'axios';
import { API } from '../App';
import { toast } from 'sonner';

function CommandExecutor() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  
  const [device, setDevice] = useState(null);
  const [commandTemplates, setCommandTemplates] = useState({});
  const [selectedCommands, setSelectedCommands] = useState([]);
  const [customCommands, setCustomCommands] = useState('');
  const [execution, setExecution] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wsConnection, setWsConnection] = useState(null);
  const [liveOutputs, setLiveOutputs] = useState({}); // command -> partial output
  // Suggestions state
  const [suggestForm, setSuggestForm] = useState({
    device_type: '',
    vendor: '',
    model: '',
    os_version: '',
    role: '',
    goal: ''
  });
  const [suggestions, setSuggestions] = useState({ groups: {}, notes: ''});
  const [suggestLoading, setSuggestLoading] = useState(false);
  // AI Runner state
  const [aiGoal, setAiGoal] = useState('');
  const [aiAssumeSudo, setAiAssumeSudo] = useState(true);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiSteps, setAiSteps] = useState([]); // [{id, description, command}]
  const [aiSelected, setAiSelected] = useState({}); // id -> boolean
  
  const wsRef = useRef(null);

  useEffect(() => {
    loadDeviceAndTemplates();
    loadExecutionHistory();
    setupWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [deviceId]);

  const setupWebSocket = () => {
    try {
      const wsUrl = `${API.replace('http', 'ws')}/ws/${deviceId}`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnection(ws);
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnection(null);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
    }
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'execution_started':
        toast.info('Command execution started');
        setLiveOutputs({});
        break;
      case 'execution_progress': {
        const { command, status, output } = data;
        setLiveOutputs((prev) => {
          const next = { ...prev };
          if (status === 'started' && !(command in next)) {
            next[command] = '';
          } else if ((status === 'completed' || status === 'error') && typeof output === 'string') {
            next[command] = output;
          }
          return next;
        });
        break;
      }
      case 'execution_completed':
        (async () => {
          try {
            toast.success('Commands executed successfully');
            setIsExecuting(false);
            // Fetch the latest execution object with raw_outputs parsed_outputs
            if (data.execution_id) {
              const execRes = await axios.get(`${API}/executions/${data.execution_id}`);
              setExecution(execRes.data);
            }
          } catch (e) {
            console.error('Failed to fetch completed execution', e);
          } finally {
            loadExecutionHistory();
          }
        })();
        break;
      case 'execution_failed':
        (async () => {
          try {
            toast.error(`Execution failed: ${data.error}`);
            setIsExecuting(false);
            if (data.execution_id) {
              const execRes = await axios.get(`${API}/executions/${data.execution_id}`);
              setExecution(execRes.data);
            }
          } catch (e) {
            console.error('Failed to fetch failed execution', e);
          } finally {
            loadExecutionHistory();
          }
        })();
        break;
      default:
        console.log('Unknown WebSocket message:', data);
    }
  };

  const loadDeviceAndTemplates = async () => {
    try {
      setLoading(true);
      
      // Load device info
      const deviceResponse = await axios.get(`${API}/devices/${deviceId}`);
      const deviceData = deviceResponse.data;
      setDevice(deviceData);
      // Initialize suggestion form device type with current device type
      setSuggestForm((prev) => ({ ...prev, device_type: deviceData.device_type }));
      
      // Load command templates for this device type
      const templatesResponse = await axios.get(`${API}/command-templates/${deviceData.device_type}`);
      setCommandTemplates(templatesResponse.data);
      
    } catch (error) {
      console.error('Error loading device data:', error);
      toast.error('Failed to load device information');
      navigate('/devices');
    } finally {
      setLoading(false);
    }
  };

  const loadExecutionHistory = async () => {
    try {
      const response = await axios.get(`${API}/devices/${deviceId}/executions`);
      setExecutionHistory(response.data);
    } catch (error) {
      console.error('Error loading execution history:', error);
    }
  };

  const requestSuggestions = async () => {
    try {
      setSuggestLoading(true);
      const payload = { ...suggestForm };
      // Ensure device_type is set; fallback to current device
      if (!payload.device_type && device) payload.device_type = device.device_type;
      const res = await axios.post(`${API}/suggest-commands`, payload);
      setSuggestions(res.data || { groups: {}, notes: ''});
      toast.success('Suggestions ready');
    } catch (err) {
      console.error('Suggest commands failed', err);
      toast.error('Failed to get suggestions');
    } finally {
      setSuggestLoading(false);
    }
  };

  const clearRanCommands = () => {
    try {
      const ran = new Set((execution && execution.commands) || []);
      // Remove ran commands from selected list
      setSelectedCommands(prev => prev.filter(c => !ran.has(c)));
      // Remove matching lines from customCommands
      setCustomCommands(prev => {
        if (!execution) return prev;
        const lines = prev.split('\n');
        const kept = lines.filter(line => !ran.has(line.trim()));
        return kept.join('\n');
      });
      toast.success('Cleared ran commands');
    } catch (e) {
      console.error('Failed to clear ran commands', e);
    }
  };

  const handleCommandToggle = (command, checked) => {
    if (checked) {
      setSelectedCommands([...selectedCommands, command]);
    } else {
      setSelectedCommands(selectedCommands.filter(cmd => cmd !== command));
    }
  };

  const handleExecuteCommands = async () => {
    const allCommands = [
      ...selectedCommands,
      ...customCommands.split('\n').filter(cmd => cmd.trim())
    ];

    if (allCommands.length === 0) {
      toast.error('Please select or enter at least one command');
      return;
    }

    setIsExecuting(true);
    
    try {
      const response = await axios.post(`${API}/devices/${deviceId}/execute`, {
        commands: allCommands
      });
      
      setExecution(response.data);
      toast.info('Commands are being executed...');
      
    } catch (error) {
      console.error('Error executing commands:', error);
      toast.error('Failed to start command execution');
      setIsExecuting(false);
    }
  };

  const handleGenerateDocumentation = async () => {
    if (!execution || execution.status !== 'completed') {
      toast.error('No completed execution found');
      return;
    }

    try {
      const response = await axios.post(`${API}/generate-documentation`, {
        device_id: deviceId,
        commands: execution.commands,
        template_name: 'default'
      });

      // Download the documentation
      const docResponse = await axios.get(`${API}/documentation/${response.data.id}`);
      
      const blob = new Blob([docResponse.data], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${device.name}_documentation.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Documentation generated and downloaded!');
    } catch (error) {
      console.error('Error generating documentation:', error);
      toast.error('Failed to generate documentation');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading device information...</span>
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-600" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">Device Not Found</h2>
          <p className="text-slate-600 mb-4">The requested device could not be found.</p>
          <Button onClick={() => navigate('/devices')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Devices
          </Button>
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
              onClick={() => navigate('/devices')}
              className="p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold gradient-text">Command Executor</h1>
              <p className="text-slate-600">Execute CLI commands on {device.name} ({device.ip})</p>
            </div>
          </div>
          
          <Badge className={`${device.device_type === 'arista_eos' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
            {device.device_type.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Command Selection */}
          <div className="lg:col-span-2">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Command Selection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="templates" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="templates">Command Templates</TabsTrigger>
                    <TabsTrigger value="custom">Custom Commands</TabsTrigger>
                    <TabsTrigger value="suggest">Suggestions</TabsTrigger>
                    <TabsTrigger value="ai">AI Runner</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="templates" className="space-y-4">
                    {Object.keys(commandTemplates).length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        <Terminal className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No command templates available for this device type</p>
                      </div>
                    ) : (
                      Object.entries(commandTemplates).map(([category, commands]) => (
                        <div key={category} className="space-y-2">
                          <h3 className="font-semibold text-slate-700 capitalize">
                            {category.replace('_', ' ')}
                          </h3>
                          <div className="grid grid-cols-1 gap-2">
                            {commands.map((command, index) => (
                              <div key={index} className="flex items-center space-x-2 p-2 bg-slate-50 rounded-lg">
                                <Checkbox
                                  id={`${category}-${index}`}
                                  checked={selectedCommands.includes(command)}
                                  onCheckedChange={(checked) => handleCommandToggle(command, checked)}
                                />
                                <label
                                  htmlFor={`${category}-${index}`}
                                  className="font-mono text-sm cursor-pointer flex-1"
                                >
                                  {command}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="ai">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div className="md:col-span-3">
                          <label className="block text-xs text-slate-600 mb-1">Goal</label>
                          <input
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={aiGoal}
                            onChange={(e) => setAiGoal(e.target.value)}
                            placeholder="e.g., install postgresql and start service"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id="ai-sudo"
                            type="checkbox"
                            checked={aiAssumeSudo}
                            onChange={(e) => setAiAssumeSudo(e.target.checked)}
                          />
                          <label htmlFor="ai-sudo" className="text-sm text-slate-700">Assume sudo</label>
                        </div>
                        <div className="md:col-span-4 flex justify-end">
                          <Button
                            onClick={async () => {
                              try {
                                if (!aiGoal.trim()) { toast.error('Enter a goal'); return; }
                                setAiPlanning(true);
                                setAiSteps([]);
                                setAiSelected({});
                                const res = await axios.post(`${API}/ai/plan`, {
                                  device_id: deviceId,
                                  goal: aiGoal,
                                  assume_sudo: aiAssumeSudo,
                                });
                                const steps = (res.data && res.data.steps) || [];
                                setAiSteps(steps);
                                const initSel = {};
                                steps.forEach(s => initSel[s.id] = true);
                                setAiSelected(initSel);
                                toast.success('Plan ready');
                              } catch (err) {
                                console.error('AI plan failed', err);
                                toast.error('Failed to generate plan');
                              } finally {
                                setAiPlanning(false);
                              }
                            }}
                            disabled={aiPlanning}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            {aiPlanning ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Planning</>) : (<><Wand2 className="w-4 h-4 mr-2"/> Plan</>)}
                          </Button>
                        </div>
                      </div>

                      {aiSteps.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <div className="text-sm text-slate-600">Review and select steps to run</div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const all = {};
                                  aiSteps.forEach(s => all[s.id] = true);
                                  setAiSelected(all);
                                }}
                              >Select All</Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAiSelected({})}
                              >Clear</Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {aiSteps.map((s) => (
                              <div key={s.id} className="p-3 bg-slate-50 rounded border border-slate-200">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-slate-800">{s.description}</div>
                                    <div className="font-mono text-xs bg-white border border-slate-200 rounded p-2 mt-2 overflow-auto">{s.command}</div>
                                  </div>
                                  <div className="pl-2">
                                    <Checkbox
                                      id={`ai-${s.id}`}
                                      checked={!!aiSelected[s.id]}
                                      onCheckedChange={(checked) => setAiSelected(prev => ({...prev, [s.id]: !!checked}))}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-end">
                            <Button
                              onClick={async () => {
                                const cmds = aiSteps.filter(s => aiSelected[s.id]).map(s => s.command);
                                if (cmds.length === 0) { toast.error('Select at least one step'); return; }
                                try {
                                  setIsExecuting(true);
                                  const response = await axios.post(`${API}/devices/${deviceId}/execute`, { commands: cmds });
                                  setExecution(response.data);
                                  toast.info('Running AI plan...');
                                } catch (err) {
                                  console.error('Run AI plan failed', err);
                                  toast.error('Failed to start AI plan');
                                  setIsExecuting(false);
                                }
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >Run Plan</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="custom">
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600">Enter custom CLI commands (one per line):</p>
                      <Textarea
                        placeholder="show version&#10;show interfaces&#10;show running-config"
                        value={customCommands}
                        onChange={(e) => setCustomCommands(e.target.value)}
                        rows={8}
                        className="font-mono text-sm"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="suggest">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Device Type</label>
                          <input
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={suggestForm.device_type}
                            onChange={(e) => setSuggestForm({ ...suggestForm, device_type: e.target.value })}
                            placeholder="cisco_ios | arista_eos | server_ssh"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Vendor</label>
                          <input
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={suggestForm.vendor}
                            onChange={(e) => setSuggestForm({ ...suggestForm, vendor: e.target.value })}
                            placeholder="Cisco | Arista | ..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Role</label>
                          <input
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            value={suggestForm.role}
                            onChange={(e) => setSuggestForm({ ...suggestForm, role: e.target.value })}
                            placeholder="access-switch | core | router | web"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="block text-xs text-slate-600 mb-1">Goal</label>
                          <Textarea
                            placeholder="e.g., troubleshoot interface errors, check BGP neighbors"
                            value={suggestForm.goal}
                            onChange={(e) => setSuggestForm({ ...suggestForm, goal: e.target.value })}
                            rows={3}
                            className="text-sm"
                          />
                        </div>
                        <div className="md:col-span-3 flex justify-end">
                          <Button onClick={requestSuggestions} disabled={suggestLoading} className="bg-emerald-600 hover:bg-emerald-700">
                            {suggestLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Getting Suggestions
                              </>
                            ) : (
                              <>
                                <Wand2 className="w-4 h-4 mr-2" /> Get Suggestions
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {suggestions && suggestions.groups && Object.keys(suggestions.groups).length > 0 && (
                        <div className="space-y-4">
                          {Object.entries(suggestions.groups).map(([category, cmds]) => (
                            <div key={category} className="space-y-2">
                              <h3 className="font-semibold text-slate-700 capitalize">{category.replace('_',' ')}</h3>
                              <div className="grid grid-cols-1 gap-2">
                                {cmds.map((command, idx) => (
                                  <div key={idx} className="flex items-center space-x-2 p-2 bg-slate-50 rounded-lg">
                                    <Checkbox
                                      id={`s-${category}-${idx}`}
                                      checked={selectedCommands.includes(command)}
                                      onCheckedChange={(checked) => handleCommandToggle(command, checked)}
                                    />
                                    <label htmlFor={`s-${category}-${idx}`} className="font-mono text-sm cursor-pointer flex-1">
                                      {command}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {suggestions && suggestions.notes && (
                        <div className="text-xs text-slate-500">{suggestions.notes}</div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-between items-center mt-6">
                  <div className="text-sm text-slate-600">
                    {selectedCommands.length + customCommands.split('\n').filter(cmd => cmd.trim()).length} commands selected
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedCommands([]);
                        setCustomCommands('');
                      }}
                    >
                      Clear All
                    </Button>

                    <Button
                      variant="outline"
                      disabled={!execution || !execution.commands || execution.commands.length === 0}
                      onClick={clearRanCommands}
                    >
                      Clear Ran Commands
                    </Button>
                    
                    <Button
                      onClick={handleExecuteCommands}
                      disabled={isExecuting}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Execute Commands
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Execution History */}
          <div>
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Execution History
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={loadExecutionHistory}
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {executionHistory.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No executions yet</p>
                    </div>
                  ) : (
                    executionHistory.slice(0, 5).map((exec) => (
                      <div key={exec.id} className="p-3 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(exec.status)}
                            <Badge variant={exec.status === 'completed' ? 'default' : exec.status === 'running' ? 'secondary' : 'destructive'}>
                              {exec.status}
                            </Badge>
                          </div>
                          {exec.status === 'completed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleGenerateDocumentation}
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              Doc
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mb-1">
                          {exec.commands.length} commands
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatTimestamp(exec.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Current Execution Results */}
        {execution && (
          <Card className="glass-card mt-8">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Execution Results
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(execution.status)}
                  <Badge variant={execution.status === 'completed' ? 'default' : execution.status === 'running' ? 'secondary' : 'destructive'}>
                    {execution.status}
                  </Badge>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => { setExecution(null); setLiveOutputs({}); }}
                  >
                    Clear Results
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {execution.status === 'running' && (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-blue-600" />
                    <p className="text-slate-600">Executing commands on {device.name}...</p>
                  </div>
                  {/* Live streamed outputs */}
                  {execution.commands && execution.commands.length > 0 && (
                    <div className="space-y-3">
                      {execution.commands.map((cmd) => (
                        <div key={cmd} className="space-y-1">
                          <h4 className="font-semibold text-slate-700 font-mono text-sm bg-slate-100 px-3 py-1 rounded">
                            {cmd}
                          </h4>
                          <div className="terminal-output min-h-[3rem]">
                            {liveOutputs[cmd] ? liveOutputs[cmd] : <span className="text-slate-400 text-sm">(pending)</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {execution.status === 'completed' && execution.raw_outputs && (
                <div className="space-y-4">
                  {Object.entries(execution.raw_outputs).map(([command, output]) => (
                    <div key={command} className="space-y-2">
                      <h4 className="font-semibold text-slate-700 font-mono text-sm bg-slate-100 px-3 py-1 rounded">
                        {command}
                      </h4>
                      <div className="terminal-output">
                        {output}
                      </div>
                    </div>
                  ))}
                  
                  <div className="flex justify-end pt-4">
                    <Button 
                      onClick={handleGenerateDocumentation}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Generate Documentation
                    </Button>
                  </div>
                </div>
              )}
              
              {execution.status === 'failed' && (
                <div className="text-center py-8 text-red-600">
                  <AlertCircle className="w-8 h-8 mx-auto mb-4" />
                  <p>Command execution failed. Please check device connectivity and try again.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default CommandExecutor;