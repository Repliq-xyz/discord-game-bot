import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface CreateUserParams {
  id: string;
  username: string;
}

export class UserService {
  static async getOrCreateUser(params: CreateUserParams) {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (user) {
      // Update username if it has changed
      if (user.username !== params.username) {
        return prisma.user.update({
          where: { id: params.id },
          data: { username: params.username },
        });
      }
      return user;
    }

    // Create new user if doesn't exist
    return prisma.user.create({
      data: {
        id: params.id,
        username: params.username,
      },
    });
  }

  static async getUserPoints(userId: string) {
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
}
