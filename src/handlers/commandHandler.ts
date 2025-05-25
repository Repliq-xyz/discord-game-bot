import { Collection, REST, Routes } from "discord.js";
import { Command } from "../types/Command";
import fs from "fs";
import path from "path";

export class CommandHandler {
  private commands: Collection<string, Command> = new Collection();

  constructor() {
    this.loadCommands();
  }

  private async loadCommands() {
    const commandsPath = path.join(__dirname, "../commands");
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith(".ts"));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const { command } = await import(filePath);

      if ("data" in command && "execute" in command) {
        this.commands.set(command.data.name, command);
      }
    }
  }

  public async registerCommands(clientId: string, guildId: string) {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    const commands = this.commands.map((command) => command.data.toJSON());

    try {
      console.log("Début de l'enregistrement des commandes slash...");

      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });

      console.log("Commandes slash enregistrées avec succès!");
    } catch (error) {
      console.error(error);
    }
  }

  public getCommands(): Collection<string, Command> {
    return this.commands;
  }
}
