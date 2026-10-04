import nodemailer from 'nodemailer';

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
export function createEmailService(config = {}) {
  const configured = Boolean(config.host && config.port && config.user && config.pass && config.from);
  const transporter = configured ? nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: config.port !== 465, auth: { user: config.user, pass: config.pass }, connectionTimeout: 10000,
    greetingTimeout: 10000, socketTimeout: 15000, tls: { minVersion: 'TLSv1.2' } }) : null;
  return { configured, async sendOtp({ to, name, code, purpose }) {
    if (!transporter) throw new Error('Email transport is not configured');
    const subject = { registration: 'Verify your DePhish email', forgot_password: 'Your DePhish password reset code', mfa_login: 'Your DePhish sign-in code', mfa_enable: 'Confirm enabling DePhish MFA', mfa_disable: 'Confirm disabling DePhish MFA' }[purpose];
    const safeName = escapeHtml(name || 'there');
    await transporter.sendMail({ from: { name: config.senderName || 'DePhish', address: config.from }, to, subject,
      text: `Hello ${name || 'there'},\n\nYour DePhish verification code is ${code}. It expires in 5 minutes and can be used once. If you did not request this, ignore this email.`,
      html: `<main style="max-width:560px;margin:32px auto;padding:28px;font:16px/1.6 Arial,sans-serif;color:#10212b;border:1px solid #e7ecee;border-radius:14px"><p>Hello ${safeName},</p><p>Use this one-time DePhish code:</p><p style="padding:18px;text-align:center;background:#f2f8f7;border-radius:10px;font-size:32px;font-weight:700;letter-spacing:8px;color:#0a6663">${code}</p><p>It expires in 5 minutes and can only be used once. Never share this code with anyone.</p><p>If you did not request this, ignore this email.</p></main>`, headers: { 'X-Entity-Ref-ID': `dephish-${purpose}` } });
  }, async sendPasswordChanged({ to, name }) { if (!transporter) return; await transporter.sendMail({ from: { name: config.senderName || 'DePhish', address: config.from }, to, subject: 'Your DePhish password was changed', text: `Hello ${name || 'there'}, your password was changed. If you did not do this, contact the site administrator.` }); } };
}
