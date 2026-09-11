export const deliveryStatuses = [
  "UNASSIGNED",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE_TO_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_TO_DROPOFF",
  "ARRIVED_DROPOFF",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "RETURN_REQUIRED",
] as const;

export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const deliveryCommands = [
  "ASSIGN",
  "UNASSIGN",
  "ACCEPT",
  "START_PICKUP_ROUTE",
  "ARRIVE_PICKUP",
  "CONFIRM_PICKUP",
  "DEPART_PICKUP",
  "ARRIVE_DROPOFF",
  "COMPLETE",
  "CANCEL",
  "FAIL",
] as const;

export type DeliveryCommand = (typeof deliveryCommands)[number];

export type DeliveryEventType =
  | "delivery.assigned"
  | "delivery.unassigned"
  | "driver.accepted"
  | "pickup.route_started"
  | "pickup.arrived"
  | "pickup.completed"
  | "delivery.departed"
  | "dropoff.arrived"
  | "delivery.completed"
  | "delivery.failed"
  | "delivery.cancelled"
  | "delivery.return_required";

type Transition = { status: DeliveryStatus; eventType: DeliveryEventType };

const transitions: Partial<
  Record<DeliveryStatus, Partial<Record<DeliveryCommand, Transition>>>
> = {
  UNASSIGNED: {
    ASSIGN: { status: "ASSIGNED", eventType: "delivery.assigned" },
    CANCEL: { status: "CANCELLED", eventType: "delivery.cancelled" },
  },
  ASSIGNED: {
    UNASSIGN: { status: "UNASSIGNED", eventType: "delivery.unassigned" },
    ACCEPT: { status: "ACCEPTED", eventType: "driver.accepted" },
    CANCEL: { status: "CANCELLED", eventType: "delivery.cancelled" },
  },
  ACCEPTED: {
    START_PICKUP_ROUTE: {
      status: "EN_ROUTE_TO_PICKUP",
      eventType: "pickup.route_started",
    },
    FAIL: { status: "FAILED", eventType: "delivery.failed" },
  },
  EN_ROUTE_TO_PICKUP: {
    ARRIVE_PICKUP: { status: "ARRIVED_PICKUP", eventType: "pickup.arrived" },
    FAIL: { status: "FAILED", eventType: "delivery.failed" },
  },
  ARRIVED_PICKUP: {
    CONFIRM_PICKUP: { status: "PICKED_UP", eventType: "pickup.completed" },
    FAIL: { status: "FAILED", eventType: "delivery.failed" },
  },
  PICKED_UP: {
    DEPART_PICKUP: {
      status: "EN_ROUTE_TO_DROPOFF",
      eventType: "delivery.departed",
    },
    FAIL: { status: "RETURN_REQUIRED", eventType: "delivery.return_required" },
  },
  EN_ROUTE_TO_DROPOFF: {
    ARRIVE_DROPOFF: { status: "ARRIVED_DROPOFF", eventType: "dropoff.arrived" },
    FAIL: { status: "RETURN_REQUIRED", eventType: "delivery.return_required" },
  },
  ARRIVED_DROPOFF: {
    COMPLETE: { status: "DELIVERED", eventType: "delivery.completed" },
    FAIL: { status: "RETURN_REQUIRED", eventType: "delivery.return_required" },
  },
};

export class InvalidDeliveryTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";

  constructor(
    readonly status: DeliveryStatus,
    readonly command: DeliveryCommand,
  ) {
    super(`Cannot apply ${command} to a delivery in ${status}`);
    this.name = "InvalidDeliveryTransitionError";
  }
}

export type DeliveryState = {
  status: DeliveryStatus;
  version: number;
  assignedDriverId: string | null;
  actualPickupAt: Date | null;
  actualDeliveryAt: Date | null;
};

export type TransitionContext = {
  now: Date;
  assignedDriverId?: string;
  recipientName?: string;
};

export function transitionDelivery(
  delivery: DeliveryState,
  command: DeliveryCommand,
  context: TransitionContext,
): { delivery: DeliveryState; eventType: DeliveryEventType } {
  const transition = transitions[delivery.status]?.[command];
  if (!transition)
    throw new InvalidDeliveryTransitionError(delivery.status, command);

  if (command === "ASSIGN" && !context.assignedDriverId) {
    throw new Error("ASSIGN requires assignedDriverId");
  }
  if (command === "COMPLETE" && !context.recipientName?.trim()) {
    throw new Error("COMPLETE requires recipientName");
  }

  const next: DeliveryState = {
    ...delivery,
    status: transition.status,
    version: delivery.version + 1,
  };

  if (command === "ASSIGN")
    next.assignedDriverId = context.assignedDriverId ?? null;
  if (command === "UNASSIGN" || command === "CANCEL")
    next.assignedDriverId = null;
  if (command === "CONFIRM_PICKUP") next.actualPickupAt = context.now;
  if (command === "COMPLETE") next.actualDeliveryAt = context.now;

  return { delivery: next, eventType: transition.eventType };
}

export function allowedCommands(status: DeliveryStatus): DeliveryCommand[] {
  return Object.keys(transitions[status] ?? {}) as DeliveryCommand[];
}
