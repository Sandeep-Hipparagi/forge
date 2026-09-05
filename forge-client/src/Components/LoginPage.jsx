import React, { useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Link } from "react-router-dom";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validate = () => {
    const newErrors = {};
    const email = formData.email.trim();

    if (!email) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Enter a valid email address";
    }

    if (!formData.password.trim()) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    console.log("Logging in with:", { ...formData, email: formData.email.trim() });
    alert("Logged in successfully!");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-icon">
            <Lock className="w-6 h-6" />
          </div>
          <h2>
            Welcome Back
          </h2>
          <p>
            Please enter your credentials to access your account
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* Email */}
          <div>
            <label>
              Email Address
            </label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">
                <Mail className="w-5 h-5" />
              </span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
                required
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "login-email-error" : undefined}
                className={`auth-input ${errors.email ? "auth-input-error" : ""}`}
              />
            </div>
            {errors.email && (
              <p className="auth-error" id="login-email-error">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label>
              Password
            </label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "login-password-error" : undefined}
                className={`auth-input auth-password-input ${errors.password ? "auth-input-error" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="auth-password-toggle"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="auth-error" id="login-password-error">{errors.password}</p>
            )}
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="auth-options">
            <label className="auth-checkbox">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                Remember me
              </span>
            </label>
            <a
              href="#forgot"
              className="auth-muted-link"
            >
              Forgot password?
            </a>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="auth-submit"
          >
            Sign In
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider">
          <div>
            <div></div>
          </div>
          <div>
            <span>
              Or continue with
            </span>
          </div>
        </div>

        {/* Social Buttons */}
        <div className="auth-socials">
          <button
            type="button"
            className="auth-social-button"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"
              />
            </svg>
            Google
          </button>
          <button
            type="button"
            className="auth-social-button"
          >
            <svg fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
          </button>
        </div>

        {/* Footer Link */}
        <p className="auth-footer">
          Don't have an account?{" "}
          <Link to="/register" className="auth-link">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
