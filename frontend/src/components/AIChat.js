import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { 
  Bot, 
  Send, 
  Settings, 
  Trash2, 
  Copy,
  User,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Zap,
  Brain
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import axios from 'axios';
import { API } from '../App';

function AIChat({ terminalContent, onSendCommand, deviceId, open, onOpenChange, defaultOpen = false, floating = true }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isControlled = typeof open === 'boolean' && typeof onOpenChange === 'function';
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = (val) => {
    if (isControlled) {
      onOpenChange(val);
    } else {
      setInternalOpen(val);
    }
  };
  const messagesEndRef = useRef(null);
  
  // AI Context Settings
  const [settings, setSettings] = useState({
    smartContext: true,
    autoContext: false,
    contextLines: 20, // How many recent lines to include
    includeCommands: true,
    includeErrors: true,
    autoSendOnError: false,
    autoRun: false,
    confirmBeforeRun: true
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-context: detect errors and send to AI
  useEffect(() => {
    if (!settings.autoContext || !terminalContent) return;
    
    const lines = terminalContent.split('\n');
    const recentLines = lines.slice(-5); // Check last 5 lines
    
    // Simple error detection
    const hasError = recentLines.some(line => 
      line.toLowerCase().includes('error') ||
      line.toLowerCase().includes('failed') ||
      line.toLowerCase().includes('not found') ||
      line.includes('E:') ||
      line.includes('ERROR')
    );

    if (hasError && settings.autoSendOnError) {
      const errorContext = getSmartContext();
      if (errorContext) {
        addMessage('system', `Auto-detected error. Context: ${errorContext}`);
        sendToAI(`I encountered an error. Here's the context:\n\n${errorContext}\n\nWhat should I do?`, false);
      }
    }
  }, [terminalContent, settings.autoContext, settings.autoSendOnError]);

  const getSmartContext = () => {
    if (!terminalContent || !settings.smartContext) return terminalContent;
    
    const lines = terminalContent.split('\n');
    let contextLines = [];
    
    // Get recent lines based on settings
    const recentLines = lines.slice(-settings.contextLines);
    
    for (const line of recentLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Include commands if enabled
      if (settings.includeCommands && (trimmed.startsWith('$') || trimmed.startsWith('#') || trimmed.includes('@'))) {
        contextLines.push(line);
        continue;
      }
      
      // Include errors if enabled
      if (settings.includeErrors && (
        trimmed.toLowerCase().includes('error') ||
        trimmed.toLowerCase().includes('failed') ||
        trimmed.toLowerCase().includes('not found') ||
        trimmed.includes('E:') ||
        trimmed.includes('ERROR')
      )) {
        contextLines.push(line);
        continue;
      }
      
      // Include output lines (but limit them)
      if (contextLines.length < settings.contextLines) {
        contextLines.push(line);
      }
    }
    
    return contextLines.join('\n');
  };

  const addMessage = (role, content) => {
    const message = {
      id: Date.now(),
      role, // 'user', 'assistant', 'system'
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, message]);
    return message;
  };

  // Extract commands from assistant content
  const extractCommandsFromText = (text) => {
    if (!text) return [];
    const cmds = [];
    // Code block ```bash ...```
    const codeBlockRegex = /```(?:bash|sh)?\n([\s\S]*?)```/gim;
    let m;
    while ((m = codeBlockRegex.exec(text)) !== null) {
      const block = m[1]
        .split('\n')
        .map((ln) => ln.replace(/^\$\s*/, '').trim())
        .filter((ln) => ln && !ln.startsWith('#'));
      cmds.push(...block);
    }
    // Lines starting with $ outside blocks
    const dollarLines = text
      .split('\n')
      .map((ln) => ln.match(/^\$\s*(.+)$/)?.[1])
      .filter(Boolean);
    cmds.push(...dollarLines);
    // De-duplicate, keep order
    const seen = new Set();
    const unique = [];
    for (const c of cmds) {
      if (!seen.has(c)) { seen.add(c); unique.push(c); }
    }
    return unique.slice(0, 20);
  };

  const sendToAI = async (message, includeContext = true) => {
    if (!message.trim()) return;
    
    setIsLoading(true);
    addMessage('user', message);
    
    try {
      let prompt = message;
      
      if (includeContext) {
        const context = getSmartContext();
        if (context) {
          prompt = `Terminal Context:\n\`\`\`\n${context}\n\`\`\`\n\nQuestion: ${message}`;
        }
      }
      
      // Call your AI endpoint (you'll need to implement this)
      const response = await axios.post(`${API}/ai/chat`, {
        message: prompt,
        device_id: deviceId,
        context_type: settings.smartContext ? 'smart' : 'full'
      });
      
      const aiResponse = response.data.response || 'Sorry, I could not process your request.';
      addMessage('assistant', aiResponse);
      // Auto-run suggested commands if enabled
      if (settings.autoRun) {
        const commands = extractCommandsFromText(aiResponse);
        for (const cmd of commands) {
          const ok = !settings.confirmBeforeRun ? true : window.confirm(`Run command?\n\n${cmd}`);
          if (ok && onSendCommand) {
            onSendCommand(cmd);
          }
        }
      }
      
    } catch (error) {
      console.error('AI chat error:', error);
      addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const message = input;
    setInput('');
    sendToAI(message, true);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const copyMessage = (content) => {
    navigator.clipboard.writeText(content);
  };

  const SettingsDialog = () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI Chat Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Smart Context</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettings(prev => ({...prev, smartContext: !prev.smartContext}))}
            >
              {settings.smartContext ? 
                <ToggleRight className="w-5 h-5 text-green-600" /> : 
                <ToggleLeft className="w-5 h-5 text-gray-400" />
              }
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <Label>Auto Context</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettings(prev => ({...prev, autoContext: !prev.autoContext}))}
            >
              {settings.autoContext ? 
                <ToggleRight className="w-5 h-5 text-green-600" /> : 
                <ToggleLeft className="w-5 h-5 text-gray-400" />
              }
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <Label>Auto-run suggested commands</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettings(prev => ({...prev, autoRun: !prev.autoRun}))}
            >
              {settings.autoRun ? 
                <ToggleRight className="w-5 h-5 text-green-600" /> : 
                <ToggleLeft className="w-5 h-5 text-gray-400" />
              }
            </Button>
          </div>

          {settings.autoRun && (
            <div className="flex items-center justify-between">
              <Label>Confirm before running</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettings(prev => ({...prev, confirmBeforeRun: !prev.confirmBeforeRun}))}
              >
                {settings.confirmBeforeRun ? 
                  <ToggleRight className="w-5 h-5 text-green-600" /> : 
                  <ToggleLeft className="w-5 h-5 text-gray-400" />
                }
              </Button>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <Label>Auto-send on Error</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSettings(prev => ({...prev, autoSendOnError: !prev.autoSendOnError}))}
            >
              {settings.autoSendOnError ? 
                <ToggleRight className="w-5 h-5 text-green-600" /> : 
                <ToggleLeft className="w-5 h-5 text-gray-400" />
              }
            </Button>
          </div>
          
          <div>
            <Label>Context Lines: {settings.contextLines}</Label>
            <input
              type="range"
              min="5"
              max="50"
              value={settings.contextLines}
              onChange={(e) => setSettings(prev => ({...prev, contextLines: parseInt(e.target.value)}))}
              className="w-full mt-1"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!isOpen) {
    if (!floating) return null;
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 shadow-lg"
          size="lg"
        >
          <Bot className="w-5 h-5 mr-2" />
          AI Assistant
          {settings.autoContext && <Zap className="w-4 h-4 ml-2" />}
        </Button>
      </div>
    );
  }

  const Panel = (
      <Card className={`h-full flex flex-col shadow-xl overflow-hidden ${floating ? '' : ''}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              AI Assistant
              {settings.smartContext && <Brain className="w-4 h-4 text-blue-500" />}
              {settings.autoContext && <Zap className="w-4 h-4 text-green-500" />}
            </div>
            <div className="flex gap-1">
              <SettingsDialog />
              <Button variant="outline" size="sm" onClick={clearChat}>
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
                ×
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col p-3 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-8">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Ask me anything about your terminal!
                <div className="text-xs mt-2">
                  {settings.smartContext && <Badge variant="secondary" className="mr-1">Smart Context</Badge>}
                  {settings.autoContext && <Badge variant="secondary">Auto Context</Badge>}
                </div>
              </div>
            )}
            
            {messages.map((msg) => {
              const commands = msg.role === 'assistant' ? extractCommandsFromText(msg.content) : [];
              return (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-2 text-sm break-words whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : msg.role === 'system'
                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {msg.role === 'user' && <User className="w-3 h-3 inline mr-1" />}
                      {msg.role === 'assistant' && <Bot className="w-3 h-3 inline mr-1" />}
                      {msg.content}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-0 h-4 w-4 opacity-50 hover:opacity-100"
                      onClick={() => copyMessage(msg.content)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  {commands.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {commands.map((c, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 bg-white/60 rounded border px-2 py-1">
                          <code className="text-xs break-words whitespace-pre-wrap flex-1">{c}</code>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-700 border-green-600"
                            onClick={() => onSendCommand && onSendCommand(c)}
                          >
                            Run
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );})}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg p-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Thinking...
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about your terminal..."
              disabled={isLoading}
              className="text-sm"
            />
            <Button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()}
              size="sm"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
  );

  if (floating) {
    return createPortal(
      <div className="fixed bottom-4 right-4 w-96 h-[500px] z-[9999]">
        {Panel}
      </div>,
      document.body
    );
  }

  // Inline mode
  return (
    <div className="w-full h-full">
      {Panel}
    </div>
  );
}

export default AIChat;
