const nodemailer = require('nodemailer');

// Create reusable transporter
const createTransporter = () => {
  // For production, use SMTP credentials from env
  // For development, set SMTP_HOST=smtp.ethereal.email (nodemailer test account)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    family: 4, // Force IPv4 – Render free tier blocks IPv6 SMTP
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(email, name, resetUrl) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Restaurant Manager" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: email,
    subject: 'Reset your password – Restaurant Manager',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #4f46e5;">Password Reset Request</h2>
        <p>Namaste ${name},</p>
        <p>We received a request to reset your password. Click the button below to set a new password. This link is valid for <strong>1 hour</strong>.</p>
        <a href="${resetUrl}"
           style="display:inline-block; margin: 24px 0; padding: 12px 24px; background: #4f46e5; color: white; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Reset Password
        </a>
        <p style="color: #6b7280; font-size: 13px;">If you did not request a password reset, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
        <p style="color: #9ca3af; font-size: 12px;">Restaurant Manager · Kathmandu, Nepal</p>
      </div>
    `,
  });
}

/**
 * Send subscription confirmation email
 */
async function sendSubscriptionEmail(email, name, plan, expiresAt) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Restaurant Manager" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: email,
    subject: `Subscription Activated – ${plan.toUpperCase()} Plan`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #4f46e5;">Subscription Activated 🎉</h2>
        <p>Namaste ${name},</p>
        <p>Your <strong>${plan.toUpperCase()}</strong> plan is now active until <strong>${new Date(expiresAt).toLocaleDateString('en-NP')}</strong>.</p>
        <p>Thank you for choosing Restaurant Manager!</p>
        <p style="color: #9ca3af; font-size: 12px;">Restaurant Manager · Kathmandu, Nepal</p>
      </div>
    `,
  });
}

/**
 * Forward a customer contact form message to the restaurant owner
 */
async function sendContactEmail(ownerEmail, restaurantName, { name, email, subject, message }) {
  const transporter = createTransporter();

  // Normalise SMTP_FROM – accept both "Name <email>" and plain "email" formats
  const rawFrom = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const fromAddress = rawFrom.includes('<') ? rawFrom : `"${restaurantName} Website" <${rawFrom}>`;

  await transporter.sendMail({
    from: fromAddress,
    to: ownerEmail,
    replyTo: email,
    subject: `[Contact Form] ${subject || 'New message'} – from ${name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: auto; color: #1f2937;">
        <h2 style="color: #f59e0b;">New Contact Message</h2>
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p><strong>Subject:</strong> ${subject || '(no subject)'}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;"/>
        <p style="white-space: pre-wrap;">${message}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;"/>
        <p style="color: #9ca3af; font-size: 12px;">Sent via the ${restaurantName} website contact form.</p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail, sendSubscriptionEmail, sendContactEmail };
