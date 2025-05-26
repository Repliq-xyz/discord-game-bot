import { ButtonInteraction } from "discord.js";
import { createPrivateChannel } from "./privateChannel";

export async function startGame(interaction: ButtonInteraction) {
  try {
    const channel = await createPrivateChannel(interaction.user);
    await interaction.reply({
      content: `Your private games channel has been created: ${channel}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error in startGame:", error);
    await interaction.reply({
      content:
        "An error occurred while creating your private games channel. Please try again later.",
      ephemeral: true,
    });
  }
}
