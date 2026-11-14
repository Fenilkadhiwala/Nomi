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

interface InvitedGroup {
  name: string;
  isDefault: boolean;
}

interface SendGroupInvitationEmailParams {
  to: string;
  groupName: string;
  inviterName: string;
  invitationUrl: string;
  householdName: string;
  includesHousehold: boolean;
  invitedGroups: InvitedGroup[];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

export async function sendGroupInvitationEmail({
  to,
  groupName,
  inviterName,
  invitationUrl,
  householdName,
  includesHousehold,
  invitedGroups,
}: SendGroupInvitationEmailParams): Promise<void> {
  const from = process.env.SMTP_FROM;

  if (!from) {
    throw new Error("SMTP_FROM is not configured.");
  }

  if (invitedGroups.length === 0) {
    throw new Error("Invitation must contain at least one group.");
  }

  const isMultipleGroups = invitedGroups.length > 1;
  const privateGroups = invitedGroups.filter((group) => !group.isDefault);

  const mainGroup = invitedGroups.find((group) => group.isDefault);

  const mainName = householdName.trim() || mainGroup?.name || "Main Household";

  const invitationTitle = isMultipleGroups
    ? `You're invited to join ${invitedGroups.length} groups!`
    : includesHousehold
      ? "You're invited to a household!"
      : "You're invited to a group!";

  const invitationDescription = isMultipleGroups
    ? `${inviterName} invited you to join ${invitedGroups.length} groups on Nomi.`
    : `${inviterName} invited you to join ${invitedGroups[0].name} on Nomi.`;

  let membershipDescription: string;

  if (includesHousehold) {
    if (privateGroups.length > 0) {
      membershipDescription =
        `Accepting this invitation will make you a member of ${mainName} ` +
        `and give you access to ${privateGroups.length} private ` +
        `group${privateGroups.length === 1 ? "" : "s"}.`;
    } else {
      membershipDescription = `Accepting this invitation will make you a member of ${mainName}.`;
    }
  } else {
    membershipDescription = isMultipleGroups
      ? "Accepting this invitation will give you access to the private groups listed below. This invitation does not add you to a Main Household."
      : `Accepting this invitation will give you access to ${groupName}. This invitation does not add you to a Main Household.`;
  }

  const subject = isMultipleGroups
    ? `You're invited to join ${invitedGroups.length} groups on Nomi`
    : includesHousehold
      ? `You're invited to join ${mainName} on Nomi`
      : `You're invited to join ${invitedGroups[0].name} on Nomi`;

  const groupsHtml = invitedGroups
    .map((group) => {
      const groupType = group.isDefault
        ? "Main household group"
        : "Private group";

      return `
        <tr>
          <td style="padding:7px 0;">
            <div style="
              background:#FFFFFF;
              border:1px solid #E5EAE4;
              border-radius:10px;
              padding:13px 15px;
            ">
              <div style="
                color:#202521;
                font-size:14px;
                font-weight:600;
              ">
                ${escapeHtml(group.name)}
              </div>

              <div style="
                color:#777D75;
                font-size:12px;
                margin-top:4px;
              ">
                ${groupType}
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  const groupsText = invitedGroups
    .map((group) => {
      const groupType = group.isDefault
        ? "Main household group"
        : "Private group";

      return `- ${group.name} (${groupType})`;
    })
    .join("\n");

  const text = [
    invitationTitle,
    "",
    invitationDescription,
    "",
    membershipDescription,
    "",
    "Groups you'll join:",
    groupsText,
    "",
    "Accept your invitation:",
    invitationUrl,
    "",
    "This invitation expires in 7 days.",
    "If you weren't expecting this invitation, you can ignore this email.",
    "",
    "Nomi · Shared households, made simple.",
  ].join("\n");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>${escapeHtml(subject)}</title>
      </head>

      <body style="
        margin:0;
        padding:0;
        background:#F7F6F2;
        font-family:Arial,Helvetica,sans-serif;
      ">
        <div style="
          background:#F7F6F2;
          padding:40px 16px;
        ">
          <div style="
            max-width:520px;
            margin:0 auto;
            background:#FFFFFF;
            border:1px solid #E5E8E2;
            border-radius:18px;
            padding:36px;
          ">
            <h1 style="
              color:#244B3C;
              margin:0 0 30px;
              font-size:32px;
              font-weight:800;
              letter-spacing:-1px;
            ">
              nomi.
            </h1>

            <h2 style="
              color:#202521;
              font-size:24px;
              line-height:1.3;
              margin:0 0 16px;
            ">
              ${escapeHtml(invitationTitle)}
            </h2>

            <p style="
              color:#555D56;
              font-size:14px;
              line-height:1.7;
              margin:0 0 18px;
            ">
              ${escapeHtml(invitationDescription)}
            </p>

            <p style="
              color:#555D56;
              font-size:14px;
              line-height:1.7;
              margin:0 0 20px;
            ">
              ${escapeHtml(membershipDescription)}
            </p>

            <h3 style="
              color:#202521;
              font-size:15px;
              margin:26px 0 12px;
            ">
              Groups you'll join
            </h3>

            <table
              role="presentation"
              cellpadding="0"
              cellspacing="0"
              border="0"
              width="100%"
              style="border-collapse:collapse;"
            >
              ${groupsHtml}
            </table>

            <div style="margin:32px 0;">
              <a
                href="${escapeHtml(invitationUrl)}"
                style="
                  display:inline-block;
                  background:#244B3C;
                  color:#FFFFFF;
                  padding:15px 26px;
                  border-radius:10px;
                  text-decoration:none;
                  font-size:14px;
                  font-weight:700;
                "
              >
                Accept invitation
              </a>
            </div>

            <p style="
              color:#777D75;
              font-size:12px;
              line-height:1.7;
              margin:0;
            ">
              This invitation expires in 7 days.
              If you weren't expecting it,
              you can safely ignore this email.
            </p>
          </div>

          <div style="
            max-width:520px;
            margin:20px auto 0;
            text-align:center;
          ">
            <p style="
              color:#8B948B;
              font-size:11px;
              margin:0;
            ">
              Nomi · Shared households, made simple.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

// =====================================================
// GROUP ADDED EMAIL
// =====================================================

interface SendGroupAddedEmailParams {
  to: string;
  memberName: string;
  groupName: string;
  addedByName: string;
  groupUrl: string;
}

export async function sendGroupAddedEmail({
  to,
  memberName,
  groupName,
  addedByName,
  groupUrl,
}: SendGroupAddedEmailParams): Promise<void> {
  const from = process.env.SMTP_FROM;

  if (!from) {
    throw new Error("SMTP_FROM is not configured.");
  }

  const subject = `You've been added to ${groupName} on Nomi`;

  const text = [
    `Hi ${memberName},`,
    "",
    `${addedByName} added you to ${groupName} on Nomi.`,
    "",
    "You're already a member of this private group.",
    "You can open Nomi to chat and collaborate with your group.",
    "",
    "Open your group:",
    groupUrl,
    "",
    "If you weren't expecting this, you can leave the group.",
    "",
    "Nomi · Shared households, made simple.",
  ].join("\n");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>${escapeHtml(subject)}</title>
      </head>

      <body style="
        margin:0;
        padding:40px 16px;
        background:#F7F6F2;
        font-family:Arial,Helvetica,sans-serif;
      ">
        <div style="
          max-width:520px;
          margin:auto;
          background:#FFFFFF;
          border:1px solid #E5E8E2;
          border-radius:18px;
          padding:36px;
        ">
          <h1 style="
            color:#244B3C;
            font-size:32px;
            margin:0 0 30px;
          ">
            nomi.
          </h1>

          <h2 style="
            color:#202521;
            font-size:24px;
            line-height:1.3;
          ">
            You've been added to a group!
          </h2>

          <p style="
            color:#555D56;
            line-height:1.7;
          ">
            Hi ${escapeHtml(memberName)},
          </p>

          <p style="
            color:#555D56;
            line-height:1.7;
          ">
            <strong>${escapeHtml(addedByName)}</strong>
            added you to a group on Nomi.
          </p>

          <div style="
            background:#F1F7F2;
            border:1px solid #DCE9DF;
            border-radius:12px;
            padding:20px;
            margin:24px 0;
          ">
            <p style="
              color:#77867B;
              font-size:11px;
              font-weight:700;
              text-transform:uppercase;
              letter-spacing:1px;
              margin:0 0 8px;
            ">
              Your new group
            </p>

            <p style="
              color:#244B3C;
              font-size:20px;
              font-weight:700;
              margin:0;
            ">
              ${escapeHtml(groupName)}
            </p>

            <p style="
              color:#66786B;
              font-size:12px;
              line-height:1.6;
              margin:10px 0 0;
            ">
              You're already a member of this
              private group. No invitation
              acceptance is required.
            </p>
          </div>

          <div style="margin:30px 0;">
            <a
              href="${escapeHtml(groupUrl)}"
              style="
                display:inline-block;
                background:#244B3C;
                color:#FFFFFF;
                padding:15px 26px;
                border-radius:10px;
                text-decoration:none;
                font-size:14px;
                font-weight:700;
              "
            >
              Open group
            </a>
          </div>

          <p style="
            color:#777D75;
            font-size:12px;
            line-height:1.7;
          ">
            If you weren't expecting to be added,
            you can leave this group from Nomi.
          </p>
        </div>

        <p style="
          text-align:center;
          color:#8B948B;
          font-size:11px;
          margin-top:20px;
        ">
          Nomi · Shared households, made simple.
        </p>
      </body>
    </html>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

// =====================================================
// GROUP DELETED EMAIL
// =====================================================

interface SendGroupDeletedEmailParams {
  to: string;
  memberName: string;
  groupName: string;
  deletedByName: string;
}

export async function sendGroupDeletedEmail({
  to,
  memberName,
  groupName,
  deletedByName,
}: SendGroupDeletedEmailParams): Promise<void> {
  const from = process.env.SMTP_FROM;

  if (!from) {
    throw new Error("SMTP_FROM is not configured.");
  }

  const subject = `${groupName} was deleted on Nomi`;

  const text = [
    `Hi ${memberName},`,
    "",
    `${deletedByName} deleted the group "${groupName}" on Nomi.`,
    "",
    "The group and its conversation history are no longer available.",
    "Your membership in other groups is unaffected.",
    "",
    "Nomi · Shared households, made simple.",
  ].join("\n");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>${escapeHtml(subject)}</title>
      </head>

      <body style="
        margin:0;
        padding:40px 16px;
        background:#F7F6F2;
        font-family:Arial,Helvetica,sans-serif;
      ">
        <div style="
          max-width:520px;
          margin:auto;
          background:#FFFFFF;
          border:1px solid #E5E8E2;
          border-radius:18px;
          padding:36px;
        ">
          <h1 style="
            color:#244B3C;
            font-size:32px;
            margin:0 0 30px;
          ">
            nomi.
          </h1>

          <h2 style="
            color:#202521;
            font-size:24px;
          ">
            A group has been deleted
          </h2>

          <p style="
            color:#555D56;
            line-height:1.7;
          ">
            Hi ${escapeHtml(memberName)},
          </p>

          <p style="
            color:#555D56;
            line-height:1.7;
          ">
            <strong>${escapeHtml(deletedByName)}</strong>
            deleted the group
            <strong>${escapeHtml(groupName)}</strong>.
          </p>

          <div style="
            background:#FFF4ED;
            border:1px solid #F0D7C7;
            border-radius:12px;
            padding:18px;
            margin:24px 0;
          ">
            <p style="
              color:#854B35;
              font-size:14px;
              line-height:1.6;
              margin:0;
            ">
              This group and its conversation
              history are no longer available.
            </p>
          </div>

          <p style="
            color:#777D75;
            font-size:13px;
            line-height:1.7;
          ">
            Your other Nomi groups are unaffected.
          </p>
        </div>

        <p style="
          text-align:center;
          color:#8B948B;
          font-size:11px;
          margin-top:20px;
        ">
          Nomi · Shared households, made simple.
        </p>
      </body>
    </html>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}
