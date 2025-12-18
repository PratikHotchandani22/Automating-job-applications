/**
 * Login Page Component
 * Handles authentication via Google OAuth and magic link
 */

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Login.css";

const LoginPage = () => {
  const { signInWithGoogle, signInWithEmail, loading, isConfigured, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isConfigured && isAuthenticated) {
      const target = (location.state as any)?.from || "/overview";
      navigate(target, { replace: true });
    }
  }, [isAuthenticated, isConfigured, location.state, navigate]);

  const handleGoogleSignIn = async () => {
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    
    setError(null);
    const { error } = await signInWithEmail(email);
    if (error) {
      setError(error.message);
    } else {
      setEmailSent(true);
    }
  };

  if (!isConfigured) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="logo-dot" />
            <h1>Resume Assistant</h1>
            <p className="subtitle">Job application insights</p>
          </div>
          
          <div className="login-card">
            <div className="notice warn">
              <strong>Auth not configured</strong>
              <p>
                Supabase authentication is not set up. Add VITE_SUPABASE_URL and 
                VITE_SUPABASE_ANON_KEY to your environment variables.
              </p>
              <p className="hint">
                For local development, you can continue without authentication.
              </p>
            </div>
            
            <a href="#/overview" className="btn primary full-width">
              Continue without sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (emailSent) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <div className="logo-dot" />
            <h1>Check your email</h1>
          </div>
          
          <div className="login-card">
            <div className="notice success">
              <p>
                We sent a magic link to <strong>{email}</strong>. 
                Click the link in the email to sign in.
              </p>
            </div>
            
            <button 
              className="btn ghost full-width" 
              onClick={() => setEmailSent(false)}
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-dot" />
          <h1>Resume Assistant</h1>
          <p className="subtitle">Tailor your resume for any job</p>
        </div>

        <div className="login-card">
          {error && (
            <div className="notice error">
              {error}
            </div>
          )}

          <button
            className="btn google-btn full-width"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <svg className="google-icon" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? "Signing in..." : "Continue with Google"}
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          <form onSubmit={handleEmailSignIn}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>
            
            <button
              type="submit"
              className="btn primary full-width"
              disabled={loading || !email.trim()}
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </form>

          <p className="terms">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
