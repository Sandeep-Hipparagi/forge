import React, { useState } from "react";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { Link } from "react-router-dom";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
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

    const name = formData.name.trim();
    const email = formData.email.trim();

    if (!name) {
      newErrors.name = "Full name is required";
    } else if (name.length < 2) {
      newErrors.name = "Enter at least 2 characters";
    }

    if (!email) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Enter a valid email address";
    }

    if (!formData.password.trim()) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = "Use uppercase, lowercase, and a number";
    }

    if (!formData.confirmPassword.trim()) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (!formData.agreeTerms) {
      newErrors.agreeTerms = "You must agree to the Terms and Conditions";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    console.log("Registering with:", { ...formData, name: formData.name.trim(), email: formData.email.trim() });
    alert("Account created successfully!");
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-register">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-icon">
            <User className="w-6 h-6" />
          </div>
          <h2>
            Create an Account
          </h2>
          <p>
            Sign up today and get started in seconds
          </p>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {/* Name */}
          <div>
            <label>
              Full Name
            </label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">
                <User className="w-5 h-5" />
              </span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Jane Doe"
                autoComplete="name"
                required
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "register-name-error" : undefined}
                className={`auth-input ${errors.name ? "auth-input-error" : ""}`}
              />
            </div>
            {errors.name && <p className="auth-error" id="register-name-error">{errors.name}</p>}
          </div>

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
                aria-describedby={errors.email ? "register-email-error" : undefined}
                className={`auth-input ${errors.email ? "auth-input-error" : ""}`}
              />
            </div>
            {errors.email && (
              <p className="auth-error" id="register-email-error">{errors.email}</p>
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
                autoComplete="new-password"
                required
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "register-password-error" : undefined}
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
              <p className="auth-error" id="register-password-error">{errors.password}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label>
              Confirm Password
            </label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? "register-confirm-password-error" : undefined}
                className={`auth-input ${errors.confirmPassword ? "auth-input-error" : ""}`}
              />
            </div>
            {errors.confirmPassword && (
              <p className="auth-error" id="register-confirm-password-error">{errors.confirmPassword}</p>
            )}
          </div>

          {/* Terms Checkbox */}
          <div>
            <label className="auth-checkbox auth-terms">
              <input
                type="checkbox"
                name="agreeTerms"
                checked={formData.agreeTerms}
                onChange={handleChange}
                className="auth-checkbox-input"
                required
                aria-invalid={Boolean(errors.agreeTerms)}
                aria-describedby={errors.agreeTerms ? "register-terms-error" : undefined}
              />
              <span>
                I agree to the{" "}
                  <a href="#terms" className="auth-link">
                  Terms of Service
                </a>{" "}
                and{" "}
                  <a href="#privacy" className="auth-link">
                  Privacy Policy
                </a>
              </span>
            </label>
            {errors.agreeTerms && (
              <p className="auth-error" id="register-terms-error">{errors.agreeTerms}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="auth-submit"
          >
            Create Account
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider">
          <div>
            <div></div>
          </div>
          <div>
            <span>
              Or sign up with
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
          Already have an account?{" "}
          <Link to="/login" className="auth-link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
