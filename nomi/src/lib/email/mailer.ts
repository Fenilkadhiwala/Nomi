import "server-only";

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface SendGroupInvitationEmailParams {
  to: string;
  groupName: string;
  inviterName: string;
  invitationUrl: string;
}

export async function sendGroupInvitationEmail({
  to,
  groupName,
  inviterName,
  invitationUrl,
}: SendGroupInvitationEmailParams) {
  const from = process.env.SMTP_FROM;

  if (!from) {
    throw new Error("SMTP_FROM is not configured.");
  }

  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return entities[character];
    });

  const safeGroupName = escapeHtml(groupName);
  const safeInviterName = escapeHtml(inviterName);
  const safeUrl = escapeHtml(invitationUrl);

  await transporter.sendMail({
    from,
    to,
    subject: `You're invited to join ${groupName} on Nomi`,
    text: `${inviterName} invited you to join ${groupName} on Nomi.\n\nAccept your invitation:\n${invitationUrl}\n\nThis invitation expires in 7 days.`,
    html: `
      <div style="background:#F7F6F2;padding:40px 16px;font-family:Arial,sans-serif;">
        <div style="max-width:520px;margin:auto;background:#FFFFFF;border-radius:18px;padding:36px;">
          <h1 style="color:#244B3C;margin:0 0 24px;">
            nomi.
          </h1>

          <h2 style="color:#202521;">
            You're invited!
          </h2>

          <p style="color:#555;">
            <strong>${safeInviterName}</strong> invited you to join
            <strong>${safeGroupName}</strong> on Nomi.
          </p>

          <p style="color:#555;">
            Collaborate with your household on groceries,
            shopping lists, and shared expenses.
          </p>

          <div style="margin:32px 0;">
            <a
              href="${safeUrl}"
              style="background:#244B3C;color:#FFFFFF;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:bold;"
            >
              Accept invitation
            </a>
          </div>

          <p style="color:#777D75;font-size:12px;">
            This invitation expires in 7 days.
            If you weren't expecting it, you can ignore this email.
          </p>
        </div>
      </div>
    `,
  });
}
