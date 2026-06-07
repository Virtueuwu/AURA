"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signup } from "@/app/auth/actions";

export default function SignupForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

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
            <h1>Create an account</h1>
            <p>Start scanning and pricing items instantly</p>
          </div>

          {error && (
            <div className="auth-alert error">
              <span>⚠️</span> {error}
            </div>
          )}

          <form action={signup} className="auth-form">
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Juan dela Cruz"
                required
                autoComplete="name"
                className="input-dark"
              />
            </div>

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
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
                className="input-dark"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-auth">
              Create Account
            </button>
          </form>

          <div className="auth-divider">
            <span />
            <p>Already have an account?</p>
            <span />
          </div>

          <Link href="/login" className="btn btn-secondary btn-auth">
            Sign In
          </Link>
        </div>
      </div>
    </>
  );
}
