import {
  SlashCommandBuilder,
  CommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  CategoryChannel,
} from "discord.js";
import { Command } from "../types/Command";
import { UserService } from "../services/userService";

const GAMES_INFO = {
  "token-prediction": {
    description: "Predict whether a token's price will go up or down",
    usage: "/token-prediction [token]",
    rewards: "Earn points based on your prediction",
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

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("start-games")
    .setDescription("Create or access your private games channel"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        ephemeral: true,
      });
      return;
    }

    try {
      // Get user points
      const userPoints = await UserService.getUserPoints(interaction.user.id);

      // Find or create PRIVATE category
      let privateCategory = interaction.guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildCategory &&
          channel.name === "PRIVATE"
      ) as CategoryChannel | undefined;

      if (!privateCategory) {
        privateCategory = await interaction.guild.channels.create({
          name: "PRIVATE",
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: interaction.guild.id, // @everyone role
              deny: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id: interaction.guild.members.me!.id, // Bot role
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
              ],
            },
          ],
        });
      }

      // Check if user already has a private games channel
      const existingChannel = interaction.guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.name === `games-${interaction.user.id}`
      ) as TextChannel | undefined;

      // Create welcome embed
      const welcomeEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle(`Welcome ${interaction.user.username}!`)
        .setDescription(`You currently have **${userPoints} points**`)
        .addFields({
          name: "💎 Daily Points",
          value: "Use `/claim` to get your daily 20 points!",
          inline: false,
        })
        .setFooter({ text: "Use slash commands to play games!" });

      // Create games info embed
      const gamesEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("🎮 Available Games")
        .setDescription("Here are the games you can play:")
        .addFields(
          Object.entries(GAMES_INFO).map(([game, info]) => ({
            name: `/${game}`,
            value: `${info.description}\n**Usage:** ${info.usage}\n**Rewards:** ${info.rewards}`,
            inline: false,
          }))
        );

      if (existingChannel) {
        // Check if user has access to the channel
        const permissions = existingChannel.permissionsFor(interaction.user);
        if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
          // Give user access to the channel
          await existingChannel.permissionOverwrites.create(interaction.user, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });
        }

        // Move channel to PRIVATE category if it's not already there
        if (existingChannel.parentId !== privateCategory.id) {
          await existingChannel.setParent(privateCategory.id);
        }

        // Send welcome and games info in the existing channel
        await existingChannel.send({ embeds: [welcomeEmbed] });
        await existingChannel.send({ embeds: [gamesEmbed] });

        await interaction.reply({
          content: `Your private games channel is here: ${existingChannel}`,
          ephemeral: true,
        });
        return;
      }

      // Create new private games channel in PRIVATE category
      const channel = await interaction.guild.channels.create({
        name: `games-${interaction.user.id}`,
        type: ChannelType.GuildText,
        parent: privateCategory.id,
        permissionOverwrites: [
          {
            id: interaction.guild.id, // @everyone role
            deny: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: interaction.guild.members.me!.id, // Bot role
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          },
        ],
      });

      // Send welcome message and games info
      await channel.send({ embeds: [welcomeEmbed] });
      await channel.send({ embeds: [gamesEmbed] });

      await interaction.reply({
        content: `Your private games channel has been created: ${channel}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error creating private games channel:", error);
      await interaction.reply({
        content:
          "An error occurred while creating your private games channel. Please try again later.",
        ephemeral: true,
      });
    }
  },
};
