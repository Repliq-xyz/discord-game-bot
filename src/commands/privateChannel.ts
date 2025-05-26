import {
  SlashCommandBuilder,
  CommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
} from "discord.js";
import { Command } from "../types/Command";

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
      // Check if user already has a private games channel
      const existingChannel = interaction.guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.name === `games-${interaction.user.id}`
      ) as TextChannel | undefined;

      // Create games info embed
      const gamesEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("🎮 Welcome to your private games space!")
        .setDescription("Here are the available games in this channel:")
        .addFields(
          Object.entries(GAMES_INFO).map(([game, info]) => ({
            name: `/${game}`,
            value: `${info.description}\n**Usage:** ${info.usage}\n**Rewards:** ${info.rewards}`,
            inline: false,
          }))
        )
        .setFooter({ text: "Use slash commands to play!" });

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

        // Send games info in the existing channel
        await existingChannel.send({ embeds: [gamesEmbed] });

        await interaction.reply({
          content: `Your private games channel is here: ${existingChannel}`,
          ephemeral: true,
        });
        return;
      }

      // Create new private games channel
      const channel = await interaction.guild.channels.create({
        name: `games-${interaction.user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.id, // @everyone role
            deny: [PermissionFlagsBits.ViewChannel],
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
            ],
          },
        ],
      });

      // Send welcome message and games info
      await channel.send({
        content: `Welcome to your private games channel, ${interaction.user}!`,
      });
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
