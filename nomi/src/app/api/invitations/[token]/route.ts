import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { pool } from "@/src/lib/db/pool";
import { handleApiError } from "@/src/lib/api/api-error";

export const runtime = "nodejs";

type InvitationRow = {
  id: string;
  group_id: string;
  group_name: string;
  household_id: string;
  inviter_name: string;
  invited_email: string;
  status: string;
  expires_at: Date | string;
  include_other_groups: boolean;
  include_home_circle: boolean;
};

type TargetGroupRow = {
  id: string;
  name: string;
  is_default: boolean;
};

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ token: string }>;
  },
) {
  try {
    // 1. Validate invitation token.
    const { token } = await context.params;

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return NextResponse.json(
        {
          message: "Invalid invitation link.",
        },
        { status: 400 },
      );
    }

    // 2. Hash token before database lookup.
    const tokenHash = createHash("sha256").update(token).digest("hex");

    // 3. Find invitation and originating group.
    const result = await pool.query<InvitationRow>(
      `
        SELECT
          i.id,
          i.group_id,
          g.name AS group_name,
          g.household_id,
          u.name AS inviter_name,
          i.invited_email,
          i.status,
          i.expires_at,
          i.include_other_groups,
          i.include_home_circle
        FROM public.household_group_invitations i
        INNER JOIN public.household_groups g
          ON g.id = i.group_id
        INNER JOIN public.users u
          ON u.id = i.invited_by
        WHERE i.token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        {
          message: "Invitation not found.",
        },
        { status: 404 },
      );
    }

    const invitation = result.rows[0];

    // 4. Validate invitation status.
    if (invitation.status !== "pending") {
      return NextResponse.json(
        {
          message: "This invitation is no longer valid.",
        },
        { status: 410 },
      );
    }

    // 5. Validate expiration.
    const expiresAt = new Date(invitation.expires_at);

    if (expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          message: "This invitation has expired.",
        },
        { status: 410 },
      );
    }

    // 6. Get the exact groups selected by the inviter.
    const targets = await pool.query<TargetGroupRow>(
      `
        SELECT
          g.id,
          g.name,
          g.is_default
        FROM public.household_group_invitation_targets t
        INNER JOIN public.household_groups g
          ON g.id = t.group_id
        WHERE t.invitation_id = $1
          AND g.household_id = $2
        ORDER BY g.is_default DESC, g.name ASC
      `,
      [invitation.id, invitation.household_id],
    );

    const groups = targets.rows.map((group) => ({
      id: Number(group.id),
      name: group.name,
      isDefault: group.is_default,
    }));

    // Existing invitations created before the migration
    // may have no target records.
    // Do not infer or silently broaden their permissions.
    if (groups.length === 0) {
      return NextResponse.json(
        {
          message:
            "This invitation needs to be reissued. Please ask the inviter to send a new invitation.",
        },
        { status: 409 },
      );
    }

    // 7. Check if Home Circle is included.
    const includesHomeCircle = groups.some((group) => group.isDefault);

    // 8. Return invitation preview.
    return NextResponse.json(
      {
        groupId: Number(invitation.group_id),
        groupName: invitation.group_name,
        inviterName: invitation.inviter_name,

        invitedEmail: invitation.invited_email,

        includesHomeCircle,

        includesOtherGroups: groups.some(
          (group) => group.id !== Number(invitation.group_id),
        ),

        groups,

        expiresAt: expiresAt.toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
