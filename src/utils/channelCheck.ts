import { CommandInteraction, TextChannel, ThreadChannel } from "discord.js";

export const isPrivateGamesThread = (
  interaction: CommandInteraction
): boolean => {
  if (!interaction.guild || !interaction.channel) return false;

  // Check if the channel is a ThreadChannel and a private games thread
  return (
    interaction.channel instanceof ThreadChannel &&
    interaction.channel.name === `games-${interaction.user.username}` &&
    interaction.channel.type === 12 // PrivateThread
  );
};

export const checkPrivateGamesThread = async (
  interaction: CommandInteraction
): Promise<boolean> => {
  if (!isPrivateGamesThread(interaction)) {
    await interaction.reply({
      content:
        "This command can only be used in your private games thread. Use `/start-games` to access it.",
      ephemeral: true,
    });
    return false;
  }
  return true;
};
