import IORedis from "ioredis";
import { config } from "./config";

export function createRedis(): IORedis {
  return new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
}

export const streamKey = (organizationId: string) =>
  `deliveryos:{${organizationId}}:events`;
export const locationKey = (organizationId: string, driverId: string) =>
  `deliveryos:{${organizationId}}:driver:${driverId}:location`;
