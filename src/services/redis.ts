import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const url = new URL(redisUrl);

const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err: Error) =>
  console.error("Redis Client Error", err)
);

export async function initializeRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

export { redisClient };
