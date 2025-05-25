import { prisma } from "../lib/prisma";

interface CreateUserParams {
  id: string;
  username: string;
}

export class UserService {
  static async getOrCreateUser(params: CreateUserParams) {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (user) {
      if (user.username !== params.username) {
        return prisma.user.update({
          where: { id: params.id },
          data: { username: params.username },
        });
      }
      return user;
    }

    return prisma.user.create({
      data: {
        id: params.id,
        username: params.username,
        points: 0,
      },
    });
  }

  static async getUserPoints(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { points: true },
    });
    return user?.points ?? 0;
  }

  static async updatePoints(userId: string, pointsToAdd: number) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        points: {
          increment: pointsToAdd,
        },
      },
    });
  }

  static async getLeaderboard(limit: number = 10) {
    return prisma.user.findMany({
      orderBy: {
        points: "desc",
      },
      take: limit,
      select: {
        id: true,
        username: true,
        points: true,
      },
    });
  }

  static async claimDailyPoints(userId: string): Promise<{
    success: boolean;
    message: string;
    nextClaimTime?: Date;
    points?: number;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return { success: false, message: "User not found" };
    }

    const now = new Date();
    const lastClaim = user.lastDailyClaim;

    if (lastClaim) {
      const timeSinceLastClaim = now.getTime() - lastClaim.getTime();
      const timeUntilNextClaim = 24 * 60 * 60 * 1000 - timeSinceLastClaim;

      if (timeSinceLastClaim < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(timeUntilNextClaim / (60 * 60 * 1000));
        const minutes = Math.floor(
          (timeUntilNextClaim % (60 * 60 * 1000)) / (60 * 1000)
        );

        const timeMessage =
          hours > 0
            ? `${hours} hour${hours > 1 ? "s" : ""} and ${minutes} minute${
                minutes > 1 ? "s" : ""
              }`
            : `${minutes} minute${minutes > 1 ? "s" : ""}`;

        const nextClaimTime = new Date(
          lastClaim.getTime() + 24 * 60 * 60 * 1000
        );
        return {
          success: false,
          message: `You need to wait ${timeMessage} before claiming again`,
          nextClaimTime,
        };
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        points: { increment: 20 },
        lastDailyClaim: now,
      },
    });

    return {
      success: true,
      message: "Successfully claimed 20 points!",
      points: updatedUser.points,
    };
  }
}
