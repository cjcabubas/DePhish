import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEmail,
  validateName,
  validateOtp,
  validatePassword,
  validateReport,
  validateReportField,
  validateScanMessage,
} from "../src/utils/validation.js";

test("name and email limits accept their boundaries and reject invalid formats", () => {
  assert.equal(validateName("Al"), "");
  assert.match(validateName("A"), /at least 2/);
  assert.equal(validateName("a".repeat(100)), "");
  assert.match(validateName("a".repeat(101)), /100/);
  assert.equal(validateEmail("a".repeat(248) + "@b.com"), "");
  assert.match(validateEmail("a".repeat(250) + "@b.com"), /254/);
  assert.match(validateEmail("not-an-email"), /valid/);
});

test("passwords stay untrimmed and obey character and existing bcrypt byte limits", () => {
  assert.match(validatePassword("           ", 12), /at least/);
  assert.match(validatePassword("x".repeat(129)), /128/);
  assert.match(validatePassword("é".repeat(37)), /72 UTF-8 bytes/);
  assert.equal(validatePassword(" leading and trailing ", 12), "");
});

test("OTP preserves leading zeroes and rejects malformed values", () => {
  assert.equal(validateOtp("000001"), "");
  for (const value of ["12345", "1234567", "12a456", " 12345", 123456])
    assert.match(validateOtp(value), /6-digit/);
});

test("scan and report input boundaries match backend limits", () => {
  assert.equal(validateScanMessage("x".repeat(5000)), "");
  assert.match(validateScanMessage("x".repeat(5001)), /5,000/);
  assert.equal(validateReportField("suspiciousUrl", "https://example.com"), "");
  assert.match(validateReportField("suspiciousUrl", "x".repeat(2049)), /2048/);
  assert.match(validateReportField("senderEmail", "bad"), /valid/);
  assert.match(validateReportField("details", "x".repeat(2001)), /2000/);
  assert.match(validateReportField("note", "no"), /at least 5/);
  assert.equal(
    validateReport({
      message: "x".repeat(5000),
      suspiciousUrl: "",
      senderEmail: "",
      phone: "",
      details: "",
    }).formError,
    "",
  );
  assert.match(
    validateReport({
      message: "x".repeat(5000),
      suspiciousUrl: "",
      senderEmail: "",
      phone: "",
      details: "extra",
    }).formError,
    /combined/,
  );
});
