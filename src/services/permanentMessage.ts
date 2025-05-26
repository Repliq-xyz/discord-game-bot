import {
  Client,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { redisClient } from "./redis";

const GAMES_INFO = {
  "token-prediction": {
    description: "Predict whether a token's price will go up or down",
    usage: "/token-prediction [token]",
    rewards: "Earn points based on your prediction",
  },
  "token-prediction-battle": {
    description: "Challenge other players in a token prediction battle",
    usage: "/token-prediction-battle",
    rewards: "Earn more points by winning battles",
  },
  points: {
    description: "View your points or the player leaderboard",
    usage: "/points me or /points leaderboard",
    rewards: "Check your progress",
  },
  claim: {
    description: "Claim your daily points",
    usage: "/claim",
    rewards: "20 points per day",
  },
};

const PERMANENT_MESSAGE_KEY = "game-rules-message-id";

export class PermanentMessageService {
  private static instance: PermanentMessageService;

  private constructor() {}

  public static getInstance(): PermanentMessageService {
    if (!PermanentMessageService.instance) {
      PermanentMessageService.instance = new PermanentMessageService();
    }
    return PermanentMessageService.instance;
  }

  private async getMessageId(): Promise<string | null> {
    return await redisClient.get(PERMANENT_MESSAGE_KEY);
  }

  private async setMessageId(id: string): Promise<void> {
    await redisClient.set(PERMANENT_MESSAGE_KEY, id);
  }

  public async createOrUpdateMessage(client: Client) {
    const channel = (await client.channels.fetch(
      process.env.GAME_RULES_CHANNEL_ID || ""
    )) as TextChannel;
    if (!channel) return;

    // Set channel permissions to read-only for everyone except the bot
    await channel.permissionOverwrites.set([
      {
        id: channel.guild.roles.everyone,
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.SendMessagesInThreads,
          PermissionFlagsBits.AddReactions,
        ],
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageThreads,
        ],
        deny: [
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.SendMessagesInThreads,
        ],
      },
    ]);

    const welcomeEmbed = new EmbedBuilder()
      .setTitle("🎮 Welcome to the Game!")
      .setDescription(
        "Click the button below to start your adventure and create your private channel where you can use all game commands!"
      )
      .setColor("#0099ff");

    const gettingStartedEmbed = new EmbedBuilder()
      .setTitle("🚀 Getting Started")
      .setDescription(
        "1. Click the 'Start Game' button below\n2. You'll get access to your private channel\n3. All game commands can only be used in your private channel"
      )
      .setColor("#0099ff");

    const dailyPointsEmbed = new EmbedBuilder()
      .setTitle("🎯 Daily Points")
      .setDescription(
        "Use `/claim` to get your daily 20 points! This is your starting point for playing games."
      )
      .setColor("#0099ff");

    const tokenPredictionEmbed = new EmbedBuilder()
      .setTitle("📊 Token Prediction")
      .setDescription(
        "Use `/token-prediction [token]` to predict if a token's price will go up or down. Earn points based on your prediction accuracy!"
      )
      .setColor("#0099ff");

    const battleEmbed = new EmbedBuilder()
      .setTitle("⚔️ Token Prediction Battle")
      .setDescription(
        "Use `/token-prediction-battle` to challenge other players! Win battles to earn more points and climb the leaderboard."
      )
      .setColor("#0099ff");

    const leaderboardEmbed = new EmbedBuilder()
      .setTitle("🏆 Leaderboard")
      .setDescription(
        "Use `/points leaderboard` to see who's leading the game. Compete with other players to reach the top!"
      )
      .setColor("#0099ff");

    const tipsEmbed = new EmbedBuilder()
      .setTitle("💡 Tips")
      .setDescription(
        "• Check your points anytime with `/points me`\n• Make predictions wisely to maximize your points\n• Come back daily to claim your points\n• Challenge other players in battles for more points\n• The more you play, the more points you can earn!"
      )
      .setColor("#0099ff");

    const button = new ButtonBuilder()
      .setCustomId("start-game-button")
      .setLabel("Start Game")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    const messageId = await this.getMessageId();
    if (messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit({
          embeds: [
            welcomeEmbed,
            gettingStartedEmbed,
            dailyPointsEmbed,
            tokenPredictionEmbed,
            battleEmbed,
            leaderboardEmbed,
            tipsEmbed,
          ],
          components: [row],
        });
      } catch {
        // If the message doesn't exist anymore, create a new one
        const newMessage = await channel.send({
          embeds: [
            welcomeEmbed,
            gettingStartedEmbed,
            dailyPointsEmbed,
            tokenPredictionEmbed,
            battleEmbed,
            leaderboardEmbed,
            tipsEmbed,
          ],
          components: [row],
        });
        await this.setMessageId(newMessage.id);
      }
    } else {
      const message = await channel.send({
        embeds: [
          welcomeEmbed,
          gettingStartedEmbed,
          dailyPointsEmbed,
          tokenPredictionEmbed,
          battleEmbed,
          leaderboardEmbed,
          tipsEmbed,
        ],
        components: [row],
      });
      await this.setMessageId(message.id);
    }
  }
}
