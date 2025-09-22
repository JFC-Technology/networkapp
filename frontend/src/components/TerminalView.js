import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft, Bot, Copy, Camera } from 'lucide-react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import AIChat from './AIChat';
import 'xterm/css/xterm.css';

function TerminalView() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const containerRef = useRef(null);
  const [terminalContent, setTerminalContent] = useState('');
  const [chatInline, setChatInline] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatSideBySide, setChatSideBySide] = useState(true); // inline layout: side-by-side vs stacked
  const [splitRatio, setSplitRatio] = useState(0.5); // 0..1 terminal width when side-by-side
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef(null);
  // Vertical split (stacked layout)
  const [vSplitRatio, setVSplitRatio] = useState(0.65); // portion height for terminal when stacked
  const [vDragging, setVDragging] = useState(false);
  const vSplitRef = useRef(null);

  useEffect(() => {
    // Load chat preferences per device
    try {
      const pref = JSON.parse(localStorage.getItem(`terminalChat:${deviceId}`) || '{}');
      if (typeof pref.chatInline === 'boolean') setChatInline(pref.chatInline);
      if (typeof pref.chatOpen === 'boolean') setChatOpen(pref.chatOpen);
      if (typeof pref.chatSideBySide === 'boolean') setChatSideBySide(pref.chatSideBySide);
      if (typeof pref.splitRatio === 'number') setSplitRatio(pref.splitRatio);
      if (typeof pref.vSplitRatio === 'number') setVSplitRatio(pref.vSplitRatio);
    } catch (e) {
      // ignore
    }

    // Wait for container to be ready
    let retryTimer = null;
    const initTerminal = () => {
      if (!containerRef.current) {
        retryTimer = setTimeout(initTerminal, 50);
        return;
      }

      const term = new XTerm({
        fontSize: 14,
        convertEol: true,
        cursorBlink: true,
        theme: {
          background: '#0b1220',
        },
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Open terminal
      term.open(containerRef.current);
      
      // Wait for terminal to be fully rendered before fitting
      const waitForRender = () => {
        try {
          if (term.element && term.element.offsetWidth > 0 && term.element.offsetHeight > 0) {
            fitAddon.fit();
          } else {
            setTimeout(waitForRender, 50);
          }
        } catch (e) {
          console.warn('Fit failed, retrying...', e);
          setTimeout(waitForRender, 100);
        }
      };
      
      setTimeout(waitForRender, 200);

      const wsUrl = `${API.replace('http', 'ws')}/ssh/${deviceId}/terminal`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const trySendResize = () => {
        if (!term || !fitAddon) return;
        try {
          fitAddon.fit();
          const cols = term.cols;
          const rows = term.rows;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        } catch (e) {
          console.warn('Resize failed:', e);
        }
      };

      ws.onopen = () => {
        // Resize PTY to current size
        trySendResize();
      };

      ws.onmessage = (event) => {
        const data = event.data;
        term.write(typeof data === 'string' ? data : '');
        // Update terminal content for AI context
        updateTerminalContent();
      };

      ws.onclose = () => {
        term.writeln('\r\n[disconnected]');
      };

      ws.onerror = () => {
        term.writeln('\r\n[error: terminal websocket failed]');
      };

      // Send keypress to server
      const disposable = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      // Handle window resize
      const onResize = () => trySendResize();
      window.addEventListener('resize', onResize);

      return () => {
        window.removeEventListener('resize', onResize);
        try { disposable.dispose(); } catch (e) {}
        if (wsRef.current) {
          try { wsRef.current.close(); } catch (e) {}
        }
        if (termRef.current) {
          try { termRef.current.dispose(); } catch (e) {}
        }
      };
    };

    const cleanup = initTerminal();
    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [deviceId]);

  // Persist chat preferences per device
  useEffect(() => {
    try {
      localStorage.setItem(
        `terminalChat:${deviceId}`,
        JSON.stringify({ chatInline, chatOpen, chatSideBySide, splitRatio, vSplitRatio })
      );
    } catch (e) {
      // ignore
    }
  }, [deviceId, chatInline, chatOpen, chatSideBySide, splitRatio, vSplitRatio]);

  const getTerminalContent = () => {
    if (!termRef.current) return '';
    const term = termRef.current;
    const buffer = term.buffer.active;
    let content = '';
    
    // Get visible lines from terminal buffer
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        content += line.translateToString(true) + '\n';
      }
    }
    return content.trim();
  };

  const updateTerminalContent = () => {
    const content = getTerminalContent();
    setTerminalContent(content);
  };

  const sendCommandToTerminal = (command) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: command + '\n' }));
    }
  };

  // Allow resizing terminal on layout changes
  const refitTerminal = () => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    const ws = wsRef.current;
    if (!term || !fitAddon) return;
    try {
      fitAddon.fit();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    } catch (e) {
      // no-op
    }
  };

  // Handle splitter drag
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let ratio = x / rect.width;
      ratio = Math.max(0.2, Math.min(0.8, ratio));
      setSplitRatio(ratio);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  useEffect(() => {
    // refit terminal when ratio/layout changes
    const id = setTimeout(refitTerminal, 50);
    return () => clearTimeout(id);
  }, [splitRatio, chatInline, chatOpen, chatSideBySide]);

  // Handle vertical splitter drag
  useEffect(() => {
    if (!vDragging) return;
    const onMove = (e) => {
      const container = vSplitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      let ratio = y / rect.height;
      ratio = Math.max(0.2, Math.min(0.8, ratio));
      setVSplitRatio(ratio);
    };
    const onUp = () => setVDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [vDragging]);

  useEffect(() => {
    const id = setTimeout(refitTerminal, 50);
    return () => clearTimeout(id);
  }, [vSplitRatio]);

  const sendToAI = async () => {
    const terminalContent = getTerminalContent();
    if (!terminalContent) {
      alert('No terminal content to send');
      return;
    }

    try {
      // For now, copy to clipboard - later we can integrate with AI chat
      await navigator.clipboard.writeText(`Terminal Context:\n\n${terminalContent}`);
      alert('Terminal content copied to clipboard! You can now paste this into an AI chat.');
    } catch (err) {
      console.error('Failed to copy terminal content:', err);
      alert('Failed to copy terminal content');
    }
  };

  const copyTerminalContent = async () => {
    const content = getTerminalContent();
    try {
      await navigator.clipboard.writeText(content);
      alert('Terminal content copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy terminal content');
    }
  };

  const takeScreenshot = async () => {
    if (!containerRef.current) return;
    
    try {
      // Use html2canvas to capture the terminal
      const html2canvas = await import('html2canvas');
      const canvas = await html2canvas.default(containerRef.current);
      
      // Convert to blob and copy to clipboard
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          alert('Terminal screenshot copied to clipboard!');
        } catch (err) {
          console.error('Failed to copy screenshot:', err);
          // Fallback: download the image
          const url = canvas.toDataURL();
          const a = document.createElement('a');
          a.href = url;
          a.download = `terminal-${deviceId}-${Date.now()}.png`;
          a.click();
        }
      });
    } catch (err) {
      console.error('Screenshot failed:', err);
      alert('Screenshot failed - html2canvas not available');
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" onClick={() => navigate('/devices')} className="p-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm text-slate-500">Device ID: {deviceId}</div>
        </div>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Interactive Terminal</span>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendToAI}
                  className="border-purple-600 text-purple-600 hover:bg-purple-50"
                >
                  <Bot className="w-4 h-4 mr-1" />
                  Send to AI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyTerminalContent}
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy Text
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={takeScreenshot}
                >
                  <Camera className="w-4 h-4 mr-1" />
                  Screenshot
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setChatInline((v) => {
                      const next = !v;
                      // when switching modes, close inline and let floating launcher appear
                      if (!next) {
                        setChatOpen(false);
                      }
                      setTimeout(refitTerminal, 50);
                      return next;
                    });
                  }}
                >
                  {chatInline ? 'Use Floating Chat' : 'Use Inline Chat'}
                </Button>
                {chatInline && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatOpen((v) => !v)}
                  >
                    {chatOpen ? 'Hide Chat' : 'Show Chat'}
                  </Button>
                )}
                {chatInline && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChatSideBySide((v) => !v)}
                  >
                    {chatSideBySide ? 'Stack Chat Below' : 'Split View'}
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chatInline && chatOpen && chatSideBySide ? (
              <div ref={splitRef} className="w-full h-[70vh] flex items-stretch">
                <div style={{ width: `${Math.round(splitRatio * 100)}%` }} className="pr-2">
                  <div ref={containerRef} className="w-full h-full rounded" style={{ background: '#0b1220' }} />
                </div>
                <div
                  className="w-1 bg-slate-300 hover:bg-slate-400 cursor-col-resize rounded"
                  onMouseDown={() => setDragging(true)}
                  title="Drag to resize"
                />
                <div style={{ width: `${Math.round((1 - splitRatio) * 100)}%` }} className="pl-2">
                  <div className="h-full">
                    <AIChat 
                      terminalContent={terminalContent}
                      onSendCommand={sendCommandToTerminal}
                      deviceId={deviceId}
                      floating={false}
                      open={chatOpen}
                      onOpenChange={setChatOpen}
                    />
                  </div>
                </div>
              </div>
            ) : (
              // Stacked layout with vertical drag
              <div ref={vSplitRef} className="w-full h-[70vh] flex flex-col items-stretch">
                <div style={{ height: `${Math.round(vSplitRatio * 100)}%` }} className="pb-2">
                  <div ref={containerRef} className="w-full h-full rounded" style={{ background: '#0b1220' }} />
                </div>
                {chatInline && chatOpen && (
                  <>
                    <div
                      className="h-1 bg-slate-300 hover:bg-slate-400 cursor-row-resize rounded"
                      onMouseDown={() => setVDragging(true)}
                      title="Drag to resize"
                    />
                    <div style={{ height: `${Math.round((1 - vSplitRatio) * 100)}%` }} className="pt-2">
                      <AIChat 
                        terminalContent={terminalContent}
                        onSendCommand={sendCommandToTerminal}
                        deviceId={deviceId}
                        floating={false}
                        open={chatOpen}
                        onOpenChange={setChatOpen}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Floating AI Chat when not inline */}
        {!chatInline && (
          <AIChat 
            terminalContent={terminalContent}
            onSendCommand={sendCommandToTerminal}
            deviceId={deviceId}
            floating={true}
            defaultOpen={false}
            key={`floating-${deviceId}`}
          />
        )}
      </div>
    </div>
  );
}

export default TerminalView;
