import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      // Check for session_id in URL hash (from Google OAuth)
      const hash = window.location.hash;
      if (hash.includes('session_id=')) {
        const sessionId = hash.split('session_id=')[1].split('&')[0];
        
        // Exchange session_id for user data
        const response = await axios.get(`${API}/auth/session`, {
          headers: { 'X-Session-ID': sessionId },
          withCredentials: true
        });
        
        if (response.data.authenticated) {
          setIsAuthenticated(true);
          setUser(response.data.user);
        }
        
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        // Check existing session
        const response = await axios.get(`${API}/auth/session`, {
          withCredentials: true
        });
        
        if (response.data.authenticated) {
          setIsAuthenticated(true);
          setUser(response.data.user);
        }
      }
    } catch (error) {
      console.error('Session check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-sky-50 to-blue-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Landing setIsAuthenticated={setIsAuthenticated} setUser={setUser} />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? (
                <Dashboard user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/settings"
            element={
              isAuthenticated ? (
                <Settings user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;