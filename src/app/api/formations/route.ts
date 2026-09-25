import { NextResponse, type NextRequest } from "next/server";
import type { CreateFormationResponse } from "@/lib/api-types";
import { parseFormationApplication } from "@/lib/validation/formation";
import { errorResponse } from "@/server/errors";
import { createFormation } from "@/server/formations/create";
import { dispatchFilingLodgement } from "@/server/jobs/dispatch";
import { getSessionUserId, setSessionUser } from "@/server/session";

/** POST /api/formations — validate, price, persist and queue a formation for lodgement. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = parseFormationApplication(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Some details need attention", issues: parsed.issues } },
      { status: 422 },
    );
  }

  try {
    const created = await createFormation(parsed.data, await getSessionUserId());
    await setSessionUser(created.userId);
    await dispatchFilingLodgement(created.filingId);
    return NextResponse.json<CreateFormationResponse>(
      { companyId: created.companyId, filingId: created.filingId, quote: created.quote },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
