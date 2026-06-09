import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import MainApp from './MainApp';
import Signin from './components/Signin';
import Signup from './components/Signup';

export default function App() {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('sessionId') || crypto.randomUUID());
  const [health, setHealth] = useState(null);
  
  const [goal, setGoal] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [fileUrl, setFileUrl] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [memories, setMemories] = useState([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  
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
    setEditingTitle(false);
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
    setEditingTitle(false);
    setSteps([]);
    setGoal('');
  };

  const saveTitle = () => {
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, title: titleInput.trim() || 'Untitled Chat' } : s
    ));
    setEditingTitle(false);
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

  const deleteFile = async (e, filename) => {
    e.stopPropagation();
    try {
      await fetch(`${backendUrl}/workspace-files/${filename}`, { method: 'DELETE' });
      if (fileName === filename) {
        setFileUrl(null);
        setFileName(null);
      }
      fetchWorkspaceFiles();
    } catch (err) {
      console.error('Failed to delete file', err);
    }
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    localStorage.removeItem(`steps_${id}`);
    
    const updatedSessions = sessions.filter(s => s.id !== id);
    if (updatedSessions.length === 0) {
      const newId = crypto.randomUUID();
      setSessions([{ id: newId, title: 'Current Chat' }]);
      setSessionId(newId);
      setEditingTitle(false);
      setSteps([]);
      setGoal('');
    } else {
      setSessions(updatedSessions);
      if (id === sessionId) {
        loadSession(updatedSessions[0].id);
      }
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
    setLoading(false);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
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

    let finalGoal = goal;
    if (fileName) {
        finalGoal = `${goal}\n\n[Context: The user has uploaded a file located at '${fileName}'. You can read it using the read_file tool.]`;
    }

    setSteps(s => [...s, { type: 'user', content: goal }]);
    setGoal('');

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
                setSteps(s => [...s, { type: 'agent', content: data.answer }]);
              } else if (data.type === 'error') {
                setSteps(s => [...s, { type: 'error', content: data.content }]);
              } else {
                // Run background hooks
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
    <div className="h-screen bg-slate-900 text-slate-200 flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* Sidebar (Full Height) */}
      <div className="w-full md:w-64 bg-slate-800 border-r border-slate-700 flex flex-col shadow-lg overflow-hidden shrink-0 h-full">
        {/* Logo / Brand Area inside Sidebar */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-center shrink-0">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 text-center">
            Agentic AI System
          </h1>
        </div>

        <div className="p-3 border-b border-slate-700 font-semibold text-sm flex justify-between items-center shrink-0">
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
              className={`p-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/50 transition text-sm flex items-center justify-between group ${s.id === sessionId ? 'bg-slate-700' : ''}`}
              title={s.title}
            >
              <span className="truncate pr-2">{s.title}</span>
              <button 
                onClick={(e) => deleteSession(e, s.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition shrink-0"
                title="Delete Chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          ))}
        </div>
        
        {/* Generated Files */}
        <div className="p-3 border-t border-b border-slate-700 font-semibold text-sm flex justify-between items-center bg-slate-800 shrink-0">
          <span>Generated Files</span>
          <button onClick={fetchWorkspaceFiles} className="text-xs text-slate-400 hover:text-white transition" title="Refresh">↻</button>
        </div>
        <div className="overflow-y-auto max-h-48 border-b border-slate-700 bg-slate-800/50 shrink-0">
          {workspaceFiles.length === 0 && <div className="p-3 text-xs text-slate-500 italic text-center">No files yet</div>}
          {workspaceFiles.map(f => (
            <div 
              key={f} 
              onClick={() => { setFileUrl(`${backendUrl}/uploads/${f}`); setFileName(f); }}
              className="p-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700 transition text-sm flex items-center justify-between group"
              title={f}
            >
              <div className="flex items-center gap-2 truncate">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                <span className="truncate">{f}</span>
              </div>
              <button 
                onClick={(e) => deleteFile(e, f)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition shrink-0"
                title="Delete File"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-slate-900">
        
        {/* Header */}
        <header className="bg-slate-800 p-4 border-b border-slate-700 flex flex-wrap gap-4 items-center justify-between shadow-md shrink-0">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input 
                type="text"
                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveTitle()}
                autoFocus
              />
              <button onClick={saveTitle} className="text-xs bg-emerald-600 hover:bg-emerald-500 px-2 py-1 rounded text-white">Save</button>
              <button onClick={() => setEditingTitle(false)} className="text-xs bg-slate-600 hover:bg-slate-500 px-2 py-1 rounded text-white">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h2 className="text-lg font-semibold text-slate-200 truncate">
                {sessions.find(s => s.id === sessionId)?.title || 'Current Chat'}
              </h2>
              <button 
                onClick={() => {
                  setTitleInput(sessions.find(s => s.id === sessionId)?.title || 'Current Chat');
                  setEditingTitle(true);
                }}
                className="text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit Title"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </button>
            </div>
          )}
        </header>

        {/* Main Layout (Chat + Viewer) */}
        <main className="flex-1 overflow-hidden flex p-4 gap-4">
          
          {/* Left Column: Chat */}
          <div className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg flex flex-col overflow-hidden shadow-inner">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {steps.length === 0 && <div className="text-slate-500 text-center mt-10">How can I help you?</div>}
              {steps.filter(s => s.type === 'user' || s.type === 'agent' || s.type === 'error').map((step, idx) => (
                <div key={idx} className={`flex ${step.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg shadow-sm ${
                      step.type === 'user' ? 'bg-blue-600 text-white rounded-br-none' :
                      step.type === 'error' ? 'bg-red-900/50 border border-red-800/50 text-red-200 rounded-bl-none' :
                      'bg-slate-700 text-slate-200 rounded-bl-none'
                  }`}>
                    <div className="whitespace-pre-wrap text-sm font-sans">
                      {step.content}
                    </div>
                  </div>
                </div>
              ))}
              {isRunning && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-3 rounded-lg shadow-sm bg-slate-700 text-slate-200 rounded-bl-none flex items-center gap-2">
                     <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     <span className="text-sm text-slate-400">Agent is working...</span>
                  </div>
                </div>
              )}
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
        <footer className="bg-slate-800 p-4 border-t border-slate-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] shrink-0">
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
    </div>
  );
}
