require("dotenv").config();

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const PREFIX = "!";

client.once("ready", () => {
  console.log(`[INFO] Bot ist online! Eingeloggt als: ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  if (command === "hallo") {
    const embed = new EmbedBuilder()
      .setTitle("\ud83c\udfb0 GTA RP Casino \u2013 Willkommen!")
      .setDescription(
        `Hallo, **${message.author.username}**! \ud83d\udc4b\n\n` +
        "Willkommen im **GTA Roleplay Casino Bot**!\n" +
        "Hier kannst du dein Glueck in spannenden Casino-Spielen versuchen.\n\n" +
        "\u2728 Schreib `!hilfe` fuer eine Liste aller Befehle."
      )
      .setColor(0xffd700)
      .setFooter({ text: "GTA RP Casino Bot" })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("[FEHLER] Kein DISCORD_TOKEN gesetzt!");
  process.exit(1);
}

client.login(token);
