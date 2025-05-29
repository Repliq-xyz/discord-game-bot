import {
  SlashCommandBuilder,
  CommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  CategoryChannel,
  User,
  ThreadAutoArchiveDuration,
  ThreadChannel,
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

export async function createPrivateChannel(user: User): Promise<TextChannel> {
  const guild = user.client.guilds.cache.first();
  if (!guild) {
    throw new Error("No guild found");
  }

  // Get user points
  const userPoints = await UserService.getUserPoints(user.id);

  // Find or create PRIVATE category
  let privateCategory = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory && channel.name === "PRIVATE"
  ) as CategoryChannel | undefined;

  if (!privateCategory) {
    privateCategory = await guild.channels.create({
      name: "PRIVATE",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone role
          deny: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: guild.members.me!.id, // Bot role
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
  const existingChannel = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      channel.name === `games-${user.id}`
  ) as TextChannel | undefined;

  // Create welcome embed
  const welcomeEmbed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle(`Welcome ${user.username}!`)
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
    const permissions = existingChannel.permissionsFor(user);
    if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
      // Give user access to the channel
      await existingChannel.permissionOverwrites.create(user, {
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

    return existingChannel;
  }

  // Create new private games channel in PRIVATE category
  const channel = await guild.channels.create({
    name: `games-${user.id}`,
    type: ChannelType.GuildText,
    parent: privateCategory.id,
    permissionOverwrites: [
      {
        id: guild.id, // @everyone role
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: guild.members.me!.id, // Bot role
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

  return channel;
}

export async function createPrivateThread(user: User): Promise<ThreadChannel> {
  const guild = user.client.guilds.cache.first();
  if (!guild) {
    throw new Error("No guild found");
  }

  // Get user points
  const userPoints = await UserService.getUserPoints(user.id);

  // Find or create PRIVATE category
  let privateCategory = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory && channel.name === "PRIVATE"
  ) as CategoryChannel | undefined;

  if (!privateCategory) {
    privateCategory = await guild.channels.create({
      name: "PRIVATE",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone role
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: guild.members.me!.id, // Bot role
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

  // Find or create GAMES channel in PRIVATE category
  let gamesChannel = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      channel.name === "games" &&
      channel.parentId === privateCategory.id
  ) as TextChannel | undefined;

  if (!gamesChannel) {
    gamesChannel = await guild.channels.create({
      name: "games",
      type: ChannelType.GuildText,
      parent: privateCategory.id,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone role
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ],
          deny: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.CreatePublicThreads,
          ],
        },
        {
          id: guild.members.me!.id, // Bot role
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.CreatePrivateThreads,
          ],
        },
      ],
    });

    // Send welcome message in games channel
    const welcomeMessage = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("🎮 Games Channel")
      .setDescription("Use `/start-games` to create your private games thread!")
      .setFooter({ text: "Each user can only access their own thread" });

    await gamesChannel.send({ embeds: [welcomeMessage] });
  }

  // Create private thread
  const thread = await gamesChannel.threads.create({
    name: `games-${user.username}`,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    type: ChannelType.PrivateThread,
    reason: `Private games thread for ${user.username}`,
  });

  // Add user to thread
  await thread.members.add(user.id);

  // Create welcome embed
  const welcomeEmbed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle(`Welcome ${user.username}!`)
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

  // Send welcome message and games info
  await thread.send({ embeds: [welcomeEmbed] });
  await thread.send({ embeds: [gamesEmbed] });

  return thread;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("start-games")
    .setDescription("Create or access your private games thread"),

  async execute(interaction: CommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        ephemeral: true,
      });
      return;
    }

    try {
      const thread = await createPrivateThread(interaction.user);
      await interaction.reply({
        content: `Your private games thread has been created: ${thread}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error creating private games thread:", error);
      await interaction.reply({
        content:
          "An error occurred while creating your private games thread. Please try again later.",
        ephemeral: true,
      });
    }
  },
};
