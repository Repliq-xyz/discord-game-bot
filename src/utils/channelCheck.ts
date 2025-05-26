import { CommandInteraction, TextChannel } from "discord.js";

export const isPrivateGamesChannel = (
  interaction: CommandInteraction
): boolean => {
  if (!interaction.guild || !interaction.channel) return false;

  // Vérifie si le canal est un TextChannel et un canal privé de jeux
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
        "Cette commande ne peut être utilisée que dans votre canal privé de jeux. Utilisez `/start-games` pour y accéder.",
      ephemeral: true,
    });
    return false;
  }
  return true;
};
