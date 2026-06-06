import { useState, useEffect, useRef } from 'react';

export default function MainApp({ user, onLogout }) {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('sessionId') || crypto.randomUUID());
  const [health, setHealth] = useState(null);
  
  const [goal, setGoal] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [fileUrl, setFileUrl] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  
  const [sessions, setSessions] = useState(() => JSON.parse(localStorage.getItem('sessions')) || [{ id: sessionId, title: 'Current Chat' }]);
  
  const [steps, setSteps] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`steps_${sessionId}`)) || [];
    } catch {
      return [];
    }
  });

  const logEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(`steps_${sessionId}`, JSON.stringify(steps));
  }, [steps, sessionId]);

  const loadSession = (id) => {
    setSessionId(id);
    try {
      const savedSteps = JSON.parse(localStorage.getItem(`steps_${id}`)) || [];
      setSteps(savedSteps);
    } catch {
      setSteps([]);
    }
    setGoal('');
  };

  const newChat = () => {
    const newId = crypto.randomUUID();
    setSessionId(newId);
    setSteps([]);
    setGoal('');
  };



  useEffect(() => {
    localStorage.setItem('sessionId', sessionId);
  }, [sessionId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    fetchWorkspaceFiles();
  }, [steps]);

  const fetchWorkspaceFiles = async () => {
    try {
      const res = await fetch(`${backendUrl}/workspace-files`);
      const data = await res.json();
      setWorkspaceFiles(data.files || []);
    } catch (e) {
      console.error('Failed to fetch workspace files', e);
    }
  };

  const testConnection = async () => {
    try {
      const res = await fetch(`${backendUrl}/health`);
      const data = await res.json();
      setHealth(data.status === 'ok' ? 'Connected' : 'Error');
    } catch (e) {
      setHealth('Failed to connect');
    }
  };

  const fetchMemories = async () => {
    try {
      const res = await fetch(`${backendUrl}/memory/${sessionId}`);
      const data = await res.json();
      setMemories(data.memories || []);
    } catch (e) {
      console.error('Failed to fetch memories', e);
    }
  };

  const clearMemories = async () => {
    try {
      await fetch(`${backendUrl}/memory/${sessionId}`, { method: 'DELETE' });
      setMemories([]);
    } catch (e) {
      console.error('Failed to clear memories', e);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${backendUrl}/upload-file`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setFileUrl(data.url);
        setFileName(data.filename);
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading file");
    }
    e.target.value = null;
  };

  const runAgent = async () => {
    if (!goal.trim()) return;
    setIsRunning(true);
    
    setSessions(prev => {
      if (!prev.find(s => s.id === sessionId)) {
        return [{ id: sessionId, title: goal.substring(0, 30) + (goal.length > 30 ? '...' : '') }, ...prev];
      } else {
        return prev.map(s => s.id === sessionId && s.title === 'Current Chat' ? { ...s, title: goal.substring(0, 30) + '...' } : s);
      }
    });

    setSteps([]);

    let finalGoal = goal;
    if (fileName) {
        finalGoal = `${goal}\n\n[Context: The user has uploaded a file located at '${fileName}'. You can read it using the read_file tool.]`;
    }

    try {
      const response = await fetch(`${backendUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: finalGoal, session_id: sessionId })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep the last incomplete part in the buffer

        for (const part of parts) {
          if (part.startsWith('data: ')) {
            const dataStr = part.replace('data: ', '');
            if (dataStr === '[DONE]') break;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'final') {
                setFinalAnswer(data.answer);
                setEvaluation(data.evaluation);
              } else if (data.type === 'error') {
                setSteps(s => [...s, { type: 'error', content: data.content }]);
              } else {
                setSteps(s => [...s, data]);
                if (data.type === 'action' && data.tool === 'write_memory') {
                  fetchMemories();
                }
                if (data.type === 'observation' && data.tool === 'save_to_file') {
                  fetchWorkspaceFiles();
                }
              }
            } catch (err) {
              console.error('Parse error', err, dataStr);
            }
          }
        }
      }
    } catch (err) {
      setSteps(s => [...s, { type: 'error', content: err.message }]);
    } finally {
      setIsRunning(false);
      fetchMemories();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col font-sans">
      {/* Header & Config */}
      <header className="bg-slate-800 p-4 border-b border-slate-700 flex flex-wrap gap-4 items-center justify-between shadow-md">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          Agentic AI System
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-slate-300 text-sm">Welcome, {user?.name || 'User'}</span>
          <button 
            onClick={onLogout}
            className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 overflow-hidden flex flex-col md:flex-row p-4 gap-4">
        
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-slate-800 border border-slate-700 rounded-lg flex flex-col shadow-lg overflow-hidden shrink-0">
          <div className="p-3 border-b border-slate-700 font-semibold text-sm flex justify-between items-center">
            <span>Chats</span>
            <button onClick={newChat} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded transition">
              + New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.map(s => (
              <div 
                key={s.id} 
                onClick={() => loadSession(s.id)}
                className={`p-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/50 transition text-sm truncate ${s.id === sessionId ? 'bg-slate-700' : ''}`}
                title={s.title}
              >
                {s.title}
              </div>
            ))}
          </div>
          
          {/* Generated Files */}
          <div className="p-3 border-t border-b border-slate-700 font-semibold text-sm flex justify-between items-center bg-slate-800">
            <span>Generated Files</span>
            <button onClick={fetchWorkspaceFiles} className="text-xs text-slate-400 hover:text-white transition" title="Refresh">↻</button>
          </div>
          <div className="overflow-y-auto max-h-48 border-b border-slate-700 bg-slate-800/50">
            {workspaceFiles.length === 0 && <div className="p-3 text-xs text-slate-500 italic text-center">No files yet</div>}
            {workspaceFiles.map(f => (
              <div 
                key={f} 
                onClick={() => { setFileUrl(`${backendUrl}/uploads/${f}`); setFileName(f); }}
                className="p-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700 transition text-sm truncate flex items-center gap-2"
                title={f}
              >
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                <span className="truncate">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Left Column: Log */}
        <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg flex flex-col overflow-hidden shadow-inner">
          <div className="p-3 bg-slate-800 border-b border-slate-700 font-semibold flex justify-between items-center text-sm">
            <span>Agent Activity Log</span>
            <span className="text-xs bg-slate-700 px-2 py-1 rounded-full">{steps.length} steps</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {steps.length === 0 && <div className="text-slate-500 text-center mt-10">Waiting for task...</div>}
            {steps.map((step, idx) => (
              <div key={idx} className={`p-4 rounded-lg shadow-sm border ${
                  step.type === 'thought' ? 'bg-purple-900/20 border-purple-800/50 text-purple-200' :
                  step.type === 'action' ? 'bg-blue-900/20 border-blue-800/50 text-blue-200' :
                  step.type === 'observation' ? 'bg-emerald-900/20 border-emerald-800/50 text-emerald-200' :
                  step.type === 'error' ? 'bg-red-900/20 border-red-800/50 text-red-200' :
                  'bg-slate-800 border-slate-700'
              }`}>
                <div className="text-xs uppercase font-bold tracking-wider mb-2 opacity-70">
                  {step.type} {step.tool && `— ${step.tool}`}
                </div>
                <div className="whitespace-pre-wrap font-mono text-sm">
                  {step.content || step.result || JSON.stringify(step.args, null, 2)}
                </div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Right Column: PDF Viewer */}
        {fileUrl && (
          <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg flex flex-col shadow-lg overflow-hidden">
            <div className="p-3 border-b border-slate-700 font-semibold text-sm flex justify-between items-center">
              <span>File Viewer</span>
              <div className="flex gap-2">
                <a href={fileUrl} download target="_blank" rel="noreferrer" className="text-xs bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-300 px-2 py-1 rounded transition flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Download
                </a>
                <button onClick={() => { setFileUrl(null); setFileName(null); }} className="text-xs bg-red-900/50 hover:bg-red-800/60 text-red-300 px-2 py-1 rounded transition">Close</button>
              </div>
            </div>
            <iframe src={fileUrl} className="flex-1 w-full h-full bg-slate-200" title="File Viewer" />
          </div>
        )}

      </main>

      {/* Bottom Bar */}
      <footer className="bg-slate-800 p-4 border-t border-slate-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex gap-4 max-w-6xl mx-auto items-end w-full">
          <label className="flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 h-[46px] w-[50px] rounded-lg cursor-pointer transition shadow-lg shrink-0 mb-[2px]" title="Upload File">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
          <textarea 
            placeholder="What should the agent do?"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition shadow-inner resize-none min-h-[46px] overflow-y-auto"
            rows={1}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isRunning && goal.trim()) {
                  runAgent();
                  // Reset height after sending
                  e.target.style.height = 'auto';
                }
              }
            }}
            disabled={isRunning}
          />
          <button 
            onClick={runAgent}
            disabled={isRunning || !goal.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium px-8 h-[46px] rounded-lg transition flex items-center justify-center min-w-[140px] shadow-lg hover:shadow-blue-500/20 active:scale-95 mb-[2px]"
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Running...
              </span>
            ) : 'Run Agent'}
          </button>
        </div>
      </footer>
    </div>
  );
}
