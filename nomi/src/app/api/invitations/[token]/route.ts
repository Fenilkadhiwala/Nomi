import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { pool } from "@/src/lib/db/pool";
import { handleApiError } from "@/src/lib/api/api-error";

export const runtime = "nodejs";

type InvitationRow = {
  id: string;
  group_id: number;
  group_name: string;
  household_id: number | null;
  household_name: string | null;
  inviter_name: string;
  invited_email: string;
  status: string;
  expires_at: Date | string;
  include_other_groups: boolean;
  include_home_circle: boolean;
};

type TargetGroupRow = {
  id: number;
  name: string;
  household_id: number | null;
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
        { message: "Invalid invitation link." },
        { status: 400 },
      );
    }

    // 2. Hash the token before database lookup.
    const tokenHash = createHash("sha256").update(token).digest("hex");

    // 3. Load invitation and source group.
    //
    // LEFT JOIN is essential because standalone
    // private groups have household_id = NULL.
    const result = await pool.query<InvitationRow>(
      `
        SELECT
          i.id,
          i.group_id,
          g.name AS group_name,
          g.household_id,
          h.name AS household_name,
          u.name AS inviter_name,
          i.invited_email,
          i.status,
          i.expires_at,
          i.include_other_groups,
          i.include_home_circle
        FROM public.household_group_invitations i
        INNER JOIN public.household_groups g
          ON g.id = i.group_id
        LEFT JOIN public.households h
          ON h.id = g.household_id
        INNER JOIN public.users u
          ON u.id = i.invited_by
        WHERE i.token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: "Invitation not found." },
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

    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { message: "This invitation has expired." },
        { status: 410 },
      );
    }

    // 6. Load frozen invitation targets.
    //
    // Do not filter with household_id = $2.
    // That would exclude standalone groups.
    const targets = await pool.query<TargetGroupRow>(
      `
        SELECT
          g.id,
          g.name,
          g.household_id,
          g.is_default
        FROM public.household_group_invitation_targets t
        INNER JOIN public.household_groups g
          ON g.id = t.group_id
        WHERE t.invitation_id = $1
        ORDER BY
          g.is_default DESC,
          g.name ASC,
          g.id ASC
      `,
      [invitation.id],
    );

    const targetGroups = targets.rows;

    // 7. Validate saved targets.
    if (targetGroups.length === 0) {
      return NextResponse.json(
        {
          message:
            "This invitation needs to be reissued. Please ask the inviter to send a new invitation.",
        },
        { status: 409 },
      );
    }

    const sourceGroupId = Number(invitation.group_id);

    // Source group must be included.
    const includesSourceGroup = targetGroups.some(
      (group) => Number(group.id) === sourceGroupId,
    );

    if (!includesSourceGroup) {
      return NextResponse.json(
        {
          message:
            "This invitation has inconsistent group information. Please ask the inviter to send a new invitation.",
        },
        { status: 409 },
      );
    }

    // All target groups must have the same
    // household context as the source group.
    //
    // NULL === NULL is valid for standalone
    // private-group invitations.
    const invalidTarget = targetGroups.some(
      (group) => group.household_id !== invitation.household_id,
    );

    if (invalidTarget) {
      return NextResponse.json(
        {
          message:
            "This invitation contains groups from different households. Please ask the inviter to send a new invitation.",
        },
        { status: 409 },
      );
    }

    // 8. Determine household membership from
    // actual Main group targets, not flags.
    const mainGroups = targetGroups.filter((group) => group.is_default);

    if (mainGroups.length > 1) {
      return NextResponse.json(
        {
          message: "This invitation contains multiple Main groups.",
        },
        { status: 409 },
      );
    }

    const includesHousehold = mainGroups.length === 1;

    // Main groups must have a real household.
    if (includesHousehold && invitation.household_id === null) {
      return NextResponse.json(
        {
          message: "This invitation contains an invalid Main group.",
        },
        { status: 409 },
      );
    }

    const groups = targetGroups.map((group) => ({
      id: Number(group.id),
      name: group.name,
      isDefault: group.is_default,
    }));

    const includesOtherGroups = groups.some(
      (group) => group.id !== sourceGroupId,
    );

    // 9. Return invitation preview.
    return NextResponse.json(
      {
        groupId: sourceGroupId,
        groupName: invitation.group_name,

        // Nullable for standalone private groups.
        householdId: invitation.household_id,
        householdName: invitation.household_name,

        inviterName: invitation.inviter_name,
        invitedEmail: invitation.invited_email,

        includesHousehold,

        // Backward compatibility.
        includesHomeCircle: includesHousehold,

        includesOtherGroups,

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
