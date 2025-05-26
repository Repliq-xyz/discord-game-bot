import { CommandInteraction, TextChannel } from "discord.js";

export const isPrivateGamesChannel = (
  interaction: CommandInteraction
): boolean => {
  if (!interaction.guild || !interaction.channel) return false;

  // Check if the channel is a TextChannel and a private games channel
  return (
    interaction.channel instanceof TextChannel &&
    interaction.channel.name === `games-${interaction.user.id}`
  );
};

export const checkPrivateGamesChannel = async (
  interaction: CommandInteraction
): Promise<boolean> => {
  if (!isPrivateGamesChannel(interaction)) {
    await interaction.reply({
      content:
        "This command can only be used in your private games channel. Use `/start-games` to access it.",
      ephemeral: true,
    });
    return false;
  }
  return true;
};
