'use client'

import { useState } from 'react';
import { loginUser } from './actions';
import Loader from '@/components/Loader';

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const formData = new FormData(e.currentTarget);
    const result = await loginUser(formData);
    
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form-group animate-fade-in" style={{ animationDelay: '0.2s' }}>
      <div className="form-group">
        <label className="form-label" htmlFor="email">Email</label>
        <input 
          className="form-input" 
          type="email" 
          id="email" 
          name="email" 
          defaultValue="admin@univ.edu"
          required 
        />
      </div>
      
      <div className="form-group">
        <label className="form-label" htmlFor="password">Password</label>
        <input 
          className="form-input" 
          type="password" 
          id="password" 
          name="password" 
          defaultValue="password123"
          required 
        />
      </div>

      {error && (
        <div style={{ color: 'var(--error-color)', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
        {loading ? <><Loader size="sm" color="white" /> Signing in...</> : 'Sign In'}
      </button>

      <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        <p>Demo Credentials:</p>
        <p>Admin: admin@univ.edu / password123</p>
        <p>Viewer: viewer1@univ.edu / password123</p>
      </div>
    </form>
  );
}
