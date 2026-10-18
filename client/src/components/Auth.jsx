import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { PasswordInput } from "./PasswordInput";
import {
  validateEmail,
  validateName,
  validateOtp,
  validatePassword,
} from "../utils/validation";

export function Auth({
  mode,
  setMode,
  submit,
  requestPasswordReset,
  verifyPasswordReset,
  completePasswordReset,
  verifySignup,
  resendSignup,
  verifyMfaLogin,
  resendMfaLogin,
}) {
  const signup = mode === "signup",
    recovery = mode === "forgot-password";
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [code, setCode] = useState(""),
    [resetToken, setResetToken] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [step, setStep] = useState("request"),
    [challenge, setChallenge] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState({}),
    [touched, setTouched] = useState({});
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  function checkField(field) {
    let message = "";
    if (field === "name") message = validateName(form.name);
    if (field === "email") message = validateEmail(form.email);
    if (field === "password")
      message = validatePassword(form.password, signup ? 12 : 1);
    if (field === "newPassword") message = validatePassword(newPassword, 12);
    if (field === "confirmPassword")
      message =
        confirmPassword === newPassword ? "" : "Passwords do not match.";
    if (field === "code") message = validateOtp(code);
    setFieldErrors((previous) => ({ ...previous, [field]: message }));
    return message;
  }
  function showFieldError(field) {
    setTouched((previous) => ({ ...previous, [field]: true }));
    checkField(field);
  }
  function editField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    if (touched[field])
      setFieldErrors((previous) => ({
        ...previous,
        [field]:
          field === "name"
            ? validateName(value)
            : field === "email"
              ? validateEmail(value)
              : validatePassword(value, signup ? 12 : 1),
      }));
  }
  function editCode(value) {
    setCode(value);
    if (touched.code)
      setFieldErrors((previous) => ({ ...previous, code: validateOtp(value) }));
  }
  function fieldsForCurrentStep() {
    if (signup)
      return step === "request"
        ? ["name", "email"]
        : ["name", "email", "password", "code"];
    if (recovery)
      return step === "request"
        ? ["email"]
        : step === "verify"
          ? ["email", "code"]
          : ["email", "newPassword", "confirmPassword"];
    return step === "mfa" ? ["email", "code"] : ["email", "password"];
  }
  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const activeFields = fieldsForCurrentStep();
    const nextErrors = Object.fromEntries(
      activeFields.map((field) => {
        if (field === "name") return [field, validateName(form.name)];
        if (field === "email") return [field, validateEmail(form.email)];
        if (field === "password")
          return [field, validatePassword(form.password, signup ? 12 : 1)];
        if (field === "newPassword")
          return [field, validatePassword(newPassword, 12)];
        if (field === "confirmPassword")
          return [
            field,
            confirmPassword === newPassword ? "" : "Passwords do not match.",
          ];
        return [field, validateOtp(code)];
      }),
    );
    setTouched((previous) => ({
      ...previous,
      ...Object.fromEntries(activeFields.map((field) => [field, true])),
    }));
    setFieldErrors((previous) => ({ ...previous, ...nextErrors }));
    if (Object.values(nextErrors).some(Boolean)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (signup && step === "request") {
        await submit({ ...form, requestOnly: true });
        setStep("verify");
        setCooldown(60);
        setNotice(
          "If the address can be registered, a 6-digit code will be sent. It expires in 5 minutes.",
        );
      } else if (signup) {
        if (!form.password || form.password.length < 12)
          throw new Error("Use a password of at least 12 characters.");
        await verifySignup({ ...form, code });
      } else if (recovery && step === "request") {
        await requestPasswordReset({ email: form.email });
        setStep("verify");
        setCooldown(60);
        setNotice(
          "If an account exists, a 6-digit code will be sent. It expires in 5 minutes.",
        );
      } else if (recovery && step === "verify") {
        const result = await verifyPasswordReset({ email: form.email, code });
        setResetToken(result.resetToken);
        setStep("reset");
      } else if (recovery && step === "reset") {
        if (newPassword !== confirmPassword)
          throw new Error("The passwords do not match.");
        await completePasswordReset({
          email: form.email,
          resetToken,
          password: newPassword,
        });
        setStep("complete");
      } else if (step === "mfa")
        await verifyMfaLogin({
          email: form.email,
          challengeToken: challenge,
          code,
        });
      else {
        const result = await submit(form);
        if (result?.mfaRequired) {
          setChallenge(result.challengeToken);
          setStep("mfa");
          setCooldown(60);
          setNotice("Enter the 6-digit sign-in code sent to your email.");
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (busy || cooldown) return;
    setBusy(true);
    setError("");
    try {
      if (signup) await resendSignup(form);
      else if (step === "mfa") {
        const result = await resendMfaLogin(form);
        if (result.challengeToken) setChallenge(result.challengeToken);
      } else await requestPasswordReset({ email: form.email });
      setCooldown(60);
      setNotice("A code was sent if the request is eligible.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const complete = recovery && step === "complete";
  return (
    <main className="authPage">
      <button
        className="brand authBrand"
        disabled={busy}
        onClick={() => setMode(null)}
        aria-label="DePhish — go to scanner"
      >
        <span className="brandmark">
          <ShieldCheck size={25} />
        </span>
        <span>
          De<span>Phish</span>
        </span>
      </button>
      <nav className="authNavigation">
        <button type="button" disabled={busy} onClick={() => setMode(null)}>
          <ArrowLeft size={16} />
          Back to scanner
        </button>
        {recovery && (
          <button type="button" onClick={() => setMode("login")}>
            <LogIn size={16} />
            Back to log in
          </button>
        )}
      </nav>
      <section className="authCard">
        <span className="authIcon">
          {recovery ? <LockKeyhole /> : signup ? <UserPlus /> : <LogIn />}
        </span>
        <h1>
          {complete
            ? "Password updated"
            : signup
              ? step === "verify"
                ? "Verify your email"
                : "Create your account"
              : recovery
                ? step === "request"
                  ? "Forgot your password?"
                  : step === "verify"
                    ? "Enter your reset code"
                    : step === "reset"
                      ? "Choose a new password"
                      : "Password updated"
                : step === "mfa"
                  ? "Verify your sign-in"
                  : "Welcome back"}
        </h1>
        <p>
          {signup
            ? step === "verify"
              ? `Enter the code sent to ${form.email}.`
              : "Start scanning and keep your security history in one place."
            : recovery
              ? "Use the email address associated with your account."
              : step === "mfa"
                ? `A code was sent to ${form.email}.`
                : "Log in to view your previous scans and reports."}
        </p>
        {notice && (
          <div className="authNotice" role="status">
            {notice}
          </div>
        )}
        {!complete && (
          <form noValidate onSubmit={onSubmit} aria-busy={busy}>
            {signup && step === "request" && (
              <label>
                Full name
                <input
                  autoComplete="name"
                  disabled={busy}
                  placeholder="Enter name"
                  value={form.name}
                  onChange={(e) => editField("name", e.target.value)}
                  onBlur={() => showFieldError("name")}
                />
                {touched.name && fieldErrors.name && (
                  <span className="fieldError" role="alert">
                    {fieldErrors.name}
                  </span>
                )}
              </label>
            )}
            {(!recovery || step === "request") && step !== "mfa" && (
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  disabled={busy || step === "verify" || step === "reset"}
                  placeholder="Enter email"
                  value={form.email}
                  onChange={(e) => editField("email", e.target.value)}
                  onBlur={() => showFieldError("email")}
                />
                {touched.email && fieldErrors.email && (
                  <span className="fieldError" role="alert">
                    {fieldErrors.email}
                  </span>
                )}
              </label>
            )}
            {!signup && !recovery && step !== "mfa" && (
              <label>
                Password
                <PasswordInput
                  autoComplete="current-password"
                  disabled={busy}
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(e) => editField("password", e.target.value)}
                  onBlur={() => showFieldError("password")}
                />
                {touched.password && fieldErrors.password && (
                  <span className="fieldError" role="alert">
                    {fieldErrors.password}
                  </span>
                )}
              </label>
            )}
            {(step === "verify" || step === "mfa") && (
              <label>
                6-digit code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  disabled={busy}
                  placeholder="Enter OTP"
                  value={code}
                  onChange={(e) => editCode(e.target.value)}
                  onBlur={() => showFieldError("code")}
                />
                {touched.code && fieldErrors.code && (
                  <span className="fieldError" role="alert">
                    {fieldErrors.code}
                  </span>
                )}
              </label>
            )}
            {signup && step === "verify" && (
              <label>
                Password
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(e) => editField("password", e.target.value)}
                  onBlur={() => showFieldError("password")}
                />
                {touched.password && fieldErrors.password && (
                  <span className="fieldError" role="alert">
                    {fieldErrors.password}
                  </span>
                )}
              </label>
            )}
            {recovery && step === "reset" && (
              <>
                <label>
                  New password
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (touched.newPassword)
                        setFieldErrors((old) => ({
                          ...old,
                          newPassword: validatePassword(e.target.value, 12),
                        }));
                      if (touched.confirmPassword)
                        setFieldErrors((old) => ({
                          ...old,
                          confirmPassword:
                            confirmPassword === e.target.value
                              ? ""
                              : "Passwords do not match.",
                        }));
                    }}
                    onBlur={() => showFieldError("newPassword")}
                  />
                  {touched.newPassword && fieldErrors.newPassword && (
                    <span className="fieldError" role="alert">
                      {fieldErrors.newPassword}
                    </span>
                  )}
                </label>
                <label>
                  Confirm new password
                  <PasswordInput
                    autoComplete="new-password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (touched.confirmPassword)
                        setFieldErrors((old) => ({
                          ...old,
                          confirmPassword:
                            e.target.value === newPassword
                              ? ""
                              : "Passwords do not match.",
                        }));
                    }}
                    onBlur={() => showFieldError("confirmPassword")}
                  />
                  {touched.confirmPassword && fieldErrors.confirmPassword && (
                    <span className="fieldError" role="alert">
                      {fieldErrors.confirmPassword}
                    </span>
                  )}
                </label>
              </>
            )}
            {(step === "verify" || step === "mfa") && (
              <button
                type="button"
                className="authForgot"
                disabled={busy || cooldown > 0}
                onClick={resend}
              >
                {cooldown ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            )}
            {!recovery && !signup && step !== "mfa" && (
              <button
                type="button"
                className="authForgot"
                onClick={() => setMode("forgot-password")}
              >
                Forgot password?
              </button>
            )}
            {error && (
              <p className="scanError" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : signup
                  ? step === "verify"
                    ? "Verify and create account"
                    : "Continue"
                  : recovery
                    ? step === "request"
                      ? "Send reset code"
                      : step === "verify"
                        ? "Verify code"
                        : "Reset password"
                    : step === "mfa"
                      ? "Verify and log in"
                      : "Log in"}{" "}
              <ArrowRight size={16} />
            </button>
          </form>
        )}
        {complete && (
          <button
            type="button"
            className="primary submit"
            onClick={() => setMode("login")}
          >
            Return to log in <ArrowRight size={16} />
          </button>
        )}
        {!complete && (
          <div className="authSwitch">
            {signup || recovery
              ? "Already have an account?"
              : "New to DePhish?"}{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode(signup || recovery ? "login" : "signup")}
            >
              {signup || recovery ? "Log in" : "Create an account"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
