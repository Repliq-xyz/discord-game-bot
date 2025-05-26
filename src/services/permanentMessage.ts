import {
  Client,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from "discord.js";

export class PermanentMessageService {
  private static instance: PermanentMessageService;
  private messageId: string | null = null;

  private constructor() {}

  public static getInstance(): PermanentMessageService {
    if (!PermanentMessageService.instance) {
      PermanentMessageService.instance = new PermanentMessageService();
    }
    return PermanentMessageService.instance;
  }

  public async createOrUpdateMessage(client: Client) {
    const channel = (await client.channels.fetch(
      process.env.GAME_RULES_CHANNEL_ID || ""
    )) as TextChannel;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🎮 Welcome to the Game!")
      .setDescription(
        "Click the button below to start your adventure and create your private channel."
      )
      .setColor("#0099ff");

    const button = new ButtonBuilder()
      .setCustomId("start-game-button")
      .setLabel("Start Game")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    if (this.messageId) {
      try {
        const message = await channel.messages.fetch(this.messageId);
        await message.edit({ embeds: [embed], components: [row] });
      } catch {
        // If the message doesn't exist anymore, create a new one
        const newMessage = await channel.send({
          embeds: [embed],
          components: [row],
        });
        this.messageId = newMessage.id;
      }
    } else {
      const message = await channel.send({
        embeds: [embed],
        components: [row],
      });
      this.messageId = message.id;
    }
  }

  public setMessageId(id: string) {
    this.messageId = id;
  }

  public getMessageId(): string | null {
    return this.messageId;
  }
}
