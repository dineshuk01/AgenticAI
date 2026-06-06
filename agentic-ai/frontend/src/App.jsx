import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import MainApp from './MainApp';
import Signin from './components/Signin';
import Signup from './components/Signup';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
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

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          user ? <MainApp user={user} onLogout={handleLogout} /> : <Navigate to="/signin" />
        } 
      />
      <Route 
        path="/signin" 
        element={
          !user ? <Signin onLogin={handleLogin} /> : <Navigate to="/" />
        } 
      />
      <Route 
        path="/signup" 
        element={
          !user ? <Signup /> : <Navigate to="/" />
        } 
      />
    </Routes>
  );
}
