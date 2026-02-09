import React, { useState } from 'react';
import { Lock, Mail, Loader2, PieChart, AlertCircle } from 'lucide-react';

interface AuthPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await onLogin(email, password);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
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
            <h2 className="text-xl font-bold text-foreground">Admin Login</h2>
            <p className="text-muted-foreground text-sm">Enter your credentials to access the dashboard</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>Public sign-up is disabled.</p>
            <p>Contact system administrator for access.</p>
          </div>
        </div>

        <div className="bg-muted p-4 text-center text-xs text-muted-foreground border-t border-border">
          Protected by Lovable Cloud
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
