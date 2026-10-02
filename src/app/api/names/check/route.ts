import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { NameCheckResponse } from "@/lib/api-types";
import { ENTITY_TYPES, JURISDICTIONS } from "@/lib/domain";
import { findEntityProfile } from "@/lib/jurisdictions";
import { stripLegalEnding } from "@/lib/names";
import { checkNameAcrossJurisdictions, getRegistryAdapter } from "@/lib/registry";
import { errorResponse } from "@/server/errors";
import { clientIp, enforceRateLimits, RATE_LIMITS } from "@/server/rate-limit";

const querySchema = z.object({
  name: z.string().trim().min(1).max(200),
  jurisdiction: z.enum(JURISDICTIONS),
  entityType: z.enum(ENTITY_TYPES).optional(),
  /** Comma-separated jurisdictions to check the same distinctive name in. */
  also: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter((j): j is (typeof JURISDICTIONS)[number] => (JURISDICTIONS as readonly string[]).includes(j)) : [])),
});

/** GET /api/names/check?name=Acme%20Pty%20Ltd&jurisdiction=AU&also=UK,US_DE */
export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  const limited = await enforceRateLimits([
    [RATE_LIMITS.nameCheckMinute, ip],
    [RATE_LIMITS.nameCheckDay, ip],
  ]);
  if (limited) return limited;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid name check query", issues: parsed.error.issues } }, { status: 400 });
  }
  const { name, jurisdiction, entityType, also } = parsed.data;
  if (entityType && !findEntityProfile(jurisdiction, entityType)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Entity type not available in jurisdiction" } }, { status: 400 });
  }

  try {
    const [result, alternatives] = await Promise.all([
      getRegistryAdapter(jurisdiction).checkNameAvailability(name, jurisdiction, { entityType }),
      checkNameAcrossJurisdictions(
        stripLegalEnding(name),
        also.filter((j) => j !== jurisdiction).map((j) => ({ jurisdiction: j })),
      ),
    ]);
    return NextResponse.json<NameCheckResponse>(
      { result, alternatives },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
