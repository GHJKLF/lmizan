import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, Mail, Loader2, PieChart, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const Login: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setError(null);
        setMode('login');
        alert('Check your email to confirm your account, then sign in.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="bg-primary p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 opacity-10 rounded-full blur-3xl -mr-10 -mt-10" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg mb-4">
              <PieChart size={24} />
            </div>
            <h1 className="text-2xl font-bold text-primary-foreground tracking-tight">Imizan Finance</h1>
            <p className="text-primary-foreground/60 text-sm mt-1">Secure Financial Workspace</p>
          </div>
        </div>

        {/* Form */}
        <div className="p-8">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-foreground">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {mode === 'login'
                ? 'Enter your credentials to access the dashboard'
                : 'Create a new account to get started'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-primary hover:opacity-90 text-primary-foreground font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : mode === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <p>
                Don't have an account?{' '}
                <button onClick={() => { setMode('signup'); setError(null); }} className="text-primary font-semibold hover:underline">
                  Sign Up
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); }} className="text-primary font-semibold hover:underline">
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>

        <div className="bg-muted p-4 text-center text-xs text-muted-foreground border-t border-border">
          Protected by Lovable Cloud
        </div>
      </div>
    </div>
  );
};

export default Login;
