const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "hallo",
  description: "Begruessung vom Casino Bot",

  execute(message) {
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
  },
};
