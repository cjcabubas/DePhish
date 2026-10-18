const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const characterCount = (value) => String(value ?? "").length;

export function validateName(value) {
  const length = characterCount(String(value ?? "").trim());
  if (length < 2) return "Enter a name with at least 2 characters.";
  if (length > 100) return "Name must be 100 characters or fewer.";
  return "";
}

export function validateEmail(value) {
  if (typeof value !== "string" || !value.trim())
    return "Enter your email address.";
  const email = value.trim();
  if (email.length > 254) return "Email must be 254 characters or fewer.";
  if (!emailPattern.test(email)) return "Enter a valid email address.";
  return "";
}

export function validatePassword(value, options = {}) {
  const minimum =
    typeof options === "number" ? options : (options.minimum ?? 1);
  if (typeof value !== "string" || value.length < minimum)
    return minimum > 1
      ? `Password must be at least ${minimum} characters.`
      : "Enter your password.";
  if (characterCount(value) > 128)
    return "Password must be 128 characters or fewer.";
  if (new TextEncoder().encode(value).length > 72)
    return "Password must be no more than 72 UTF-8 bytes.";
  return "";
}

export function validateOtp(value) {
  return typeof value === "string" && /^\d{6}$/.test(value)
    ? ""
    : "Enter the 6-digit code.";
}

export function validateScanMessage(value) {
  if (typeof value !== "string" || !value.trim())
    return "Enter a message to scan.";
  if (value.length > 5000) return "Message must be 5,000 characters or fewer.";
  return "";
}

export const REPORT_LIMITS = Object.freeze({
  message: 5000,
  suspiciousUrl: 2048,
  senderEmail: 254,
  phone: 40,
  details: 2000,
  note: 1000,
});

export function validateReportField(field, value) {
  if (typeof value !== "string") return "Enter text for this field.";
  if (value.length > REPORT_LIMITS[field])
    return `Keep this field to ${REPORT_LIMITS[field]} characters or fewer.`;
  const clean = value.trim();
  if (!clean) return "";
  if (field === "senderEmail")
    return validateEmail(clean) ? "Enter a valid sender email address." : "";
  if (field === "suspiciousUrl") {
    try {
      const url = new URL(
        /^[a-z]+:\/\//i.test(clean) ? clean : `https://${clean}`,
      );
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname.includes(".") ||
        /\s/.test(clean)
      )
        throw new Error();
      if (
        url.hostname
          .split(".")
          .some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
      )
        throw new Error();
    } catch {
      return "Enter a valid public HTTP(S) link or domain.";
    }
  }
  if (field === "phone") {
    const digits = clean.replace(/\D/g, "");
    const international =
      /^\+\d[\d ()-]{6,24}\d$/.test(clean) &&
      digits.length >= 8 &&
      digits.length <= 15;
    const philippines = /^(?:09\d{2}|639\d{2})[ -]?\d{3}[ -]?\d{4}$/.test(
      clean,
    );
    if (!international && !philippines) return "Enter a valid phone number.";
  }
  if (field === "note" && clean.length < 5)
    return "Review note must be at least 5 characters.";
  return "";
}

export function validateReport(form, { hasSourceScan = false } = {}) {
  const fields = Object.fromEntries(
    Object.keys(REPORT_LIMITS)
      .filter((key) => key !== "note")
      .map((key) => [key, validateReportField(key, form[key] ?? "")])
      .filter(([, error]) => error),
  );
  const present = ["message", "suspiciousUrl", "senderEmail", "phone"].some(
    (key) => String(form[key] ?? "").trim(),
  );
  let formError =
    !present && !hasSourceScan
      ? "Provide a message, suspicious link, sender email, or phone number."
      : "";
  const clean = (key) => String(form[key] ?? "").trim();
  const combined = [
    clean("message"),
    clean("suspiciousUrl"),
    clean("senderEmail") ? `Sender: ${clean("senderEmail")}` : "",
    clean("phone") ? `Phone: ${clean("phone")}` : "",
    clean("details"),
  ]
    .filter(Boolean)
    .join("\n");
  if (!formError && combined.length > 5000)
    formError = "Keep the combined report content within 5,000 characters.";
  return { fields, formError };
}
