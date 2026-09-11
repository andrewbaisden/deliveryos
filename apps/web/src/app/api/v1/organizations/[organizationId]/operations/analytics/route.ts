import { apiError, requireMembership } from "@/lib/api";

const activeStatuses = [
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_DROPOFF",
] as const;

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
    const organization = await database.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timeZone: true },
    });
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const completed = await database.delivery.findMany({
      where: {
        organizationId,
        actualDeliveryAt: { gte: startOfDay },
      },
      select: { actualDeliveryAt: true, plannedPickupAt: true, risk: true },
    });
    const [active, failed] = await Promise.all([
      database.delivery.count({
        where: {
          organizationId,
          status: { in: [...activeStatuses] },
        },
      }),
      database.delivery.count({
        where: {
          organizationId,
          status: "FAILED",
          updatedAt: { gte: startOfDay },
        },
      }),
    ]);
    const averageMinutes = completed.length
      ? Math.round(
          completed.reduce(
            (sum, delivery) =>
              sum +
              ((delivery.actualDeliveryAt?.getTime() ?? now.getTime()) -
                delivery.plannedPickupAt.getTime()) /
                60_000,
            0,
          ) / completed.length,
        )
      : 0;
    const onTime = completed.filter(
      (delivery) => delivery.risk !== "DELAYED",
    ).length;
    const hourly = Array.from({ length: 10 }, (_, offset) => ({
      hour: `${String(offset + 8).padStart(2, "0")}:00`,
      count: completed.filter(
        (delivery) => delivery.actualDeliveryAt?.getHours() === offset + 8,
      ).length,
    }));
    return Response.json({
      data: {
        timeZone: organization.timeZone,
        completedToday: completed.length,
        active,
        failedToday: failed,
        onTime,
        onTimeRate: completed.length
          ? Math.round((onTime / completed.length) * 100)
          : null,
        averageMinutes,
        hourly,
      },
      meta: { requestId },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
