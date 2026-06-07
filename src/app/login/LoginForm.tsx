"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/app/auth/actions";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = searchParams.get("message");

  return (
    <>
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />
      <div className="bg-glow bg-glow-3" />

      <div className="auth-wrapper">
        <div className="auth-card glass">
          {/* Logo */}
          <div className="auth-logo">
            <div className="logo-icon">👁️</div>
            <span className="auth-brand">
              AURA <span className="auth-sub">Scanner</span>
            </span>
          </div>

          <div className="auth-heading">
            <h1>Welcome back</h1>
            <p>Sign in to continue scanning</p>
          </div>

          {message && (
            <div className="auth-alert success">
              <span>✅</span> {message}
            </div>
          )}

          {error && (
            <div className="auth-alert error">
              <span>⚠️</span> {error}
            </div>
          )}

          <form action={login} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="input-dark"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="input-dark"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-auth">
              Sign In
            </button>
          </form>

          <div className="auth-divider">
            <span />
            <p>Don&apos;t have an account?</p>
            <span />
          </div>

          <Link href="/signup" className="btn btn-secondary btn-auth">
            Create Account
          </Link>
        </div>
      </div>
    </>
  );
}
