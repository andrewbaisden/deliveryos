import { apiError, requireMembership } from "@/lib/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { organizationId } = await params;
    const { database } = await requireMembership(
      request.headers,
      organizationId,
      ["ADMIN", "DISPATCHER"],
    );
    const events = await database.domainEvent.findMany({
      where: { organizationId },
      include: {
        delivery: { select: { reference: true } },
        driver: { select: { name: true } },
      },
      orderBy: { sequence: "desc" },
      take: 100,
    });
    return Response.json({
      data: events.map((event) => ({
        id: event.id,
        sequence: event.sequence.toString(),
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        actorType: event.actorType,
        occurredAt: event.occurredAt.toISOString(),
        delivery: event.delivery,
        driver: event.driver,
      })),
      meta: { requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
