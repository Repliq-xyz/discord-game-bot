import { Prisma } from "../generated/prisma";

export interface CreatePredictionParams {
  userId: string;
  tokenAddress: string;
  tokenName: string;
  timeframe: string;
  direction: "UP" | "DOWN";
  expiresAt: Date;
}

export type Prediction = Prisma.PredictionGetPayload<{}>;
