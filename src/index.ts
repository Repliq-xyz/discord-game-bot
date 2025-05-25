import { Client, GatewayIntentBits, Events } from "discord.js";
import { CommandHandler } from "./handlers/commandHandler";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commandHandler = new CommandHandler();

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Connecté en tant que ${readyClient.user.tag}!`);

  // Remplacez ces valeurs par votre ID de bot et l'ID de votre serveur
  const clientId = readyClient.user.id;
  const guildId = process.env.GUILD_ID!;

  await commandHandler.registerCommands(clientId, guildId);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandHandler.getCommands().get(interaction.commandName);

  if (!command) {
    console.error(
      `Aucune commande ${interaction.commandName} n'a été trouvée.`
    );
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "Une erreur est survenue lors de l'exécution de la commande!",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "Une erreur est survenue lors de l'exécution de la commande!",
        ephemeral: true,
      });
    }
  }
});

// Le token du bot doit être défini dans un fichier .env
client.login(process.env.DISCORD_TOKEN);
