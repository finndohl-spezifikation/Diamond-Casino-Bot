require('dotenv').config();

const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder,
} = require('discord.js');

const eco = require('./economy');
const sm  = require('./slotMachine');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_ROLE = '1495237353529151528';

if (!TOKEN)     { console.error('[FEHLER] DISCORD_TOKEN fehlt!'); process.exit(1); }
if (!CLIENT_ID) { console.error('[FEHLER] CLIENT_ID fehlt!');     process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sessions = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName('jetons')
    .setDescription('Zeigt deinen aktuellen Jetons-Stand'),

  new SlashCommandBuilder()
    .setName('jetons-give')
    .setDescription('Gibt einem Spieler Jetons [Nur Staff]')
    .addUserOption((o) => o.setName('spieler').setDescription('Welchem Spieler?').setRequired(true))
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Jetons?').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('jetons-remove')
    .setDescription('Nimmt einem Spieler Jetons [Nur Staff]')
    .addUserOption((o) => o.setName('spieler').setDescription('Welchem Spieler?').setRequired(true))
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Jetons?').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('slot-machine')
    .setDescription('\uD83C\uDFB0 Spiele an der Slot Machine'),
].map((c) => c.toJSON());

function isAdmin(interaction) {
  if (!interaction.guild) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  return interaction.member?.roles?.cache?.has(ADMIN_ROLE) ?? false;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`[INFO] Bot online als: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[INFO] Slash Commands erfolgreich registriert!');
  } catch (e) {
    console.error('[FEHLER] Slash Commands konnten nicht registriert werden:', e.message);
  }
});

client.on('interactionCreate', async (interaction) => {

  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;

    if (cmd === 'jetons') {
      const bal = eco.get(interaction.user.id);
      const embed = new EmbedBuilder()
        .setTitle('\uD83C\uDFB0 Dein Jetons-Konto')
        .setDescription(
          `**${interaction.user.username}**, dein aktueller Kontostand:\n\n` +
          `\uD83D\uDCB0 **${bal.toLocaleString('de-DE')} Jetons**`
        )
        .setColor(0xFFD700)
        .setFooter({ text: 'GTA RP Casino' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (cmd === 'jetons-give') {
      if (!isAdmin(interaction))
        return interaction.reply({ content: '\u274C Du hast keine Berechtigung f\xFCr diesen Befehl!', ephemeral: true });
      const target = interaction.options.getUser('spieler');
      const amount = interaction.options.getInteger('menge');
      const newBal = eco.add(target.id, amount);
      const embed = new EmbedBuilder()
        .setTitle('\uD83D\uDCB8 Jetons hinzugef\xFCgt')
        .setDescription(
          `**${target.username}** hat **+${amount.toLocaleString('de-DE')} Jetons** erhalten!\n\n` +
          `Neues Guthaben: **${newBal.toLocaleString('de-DE')} Jetons**`
        )
        .setColor(0x00C853)
        .setFooter({ text: `Vergeben von: ${interaction.user.username}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'jetons-remove') {
      if (!isAdmin(interaction))
        return interaction.reply({ content: '\u274C Du hast keine Berechtigung f\xFCr diesen Befehl!', ephemeral: true });
      const target = interaction.options.getUser('spieler');
      const amount = interaction.options.getInteger('menge');
      const cur    = eco.get(target.id);
      const actual = Math.min(amount, cur);
      const newBal = eco.remove(target.id, actual);
      const embed = new EmbedBuilder()
        .setTitle('\uD83D\uDCB8 Jetons abgezogen')
        .setDescription(
          `**${target.username}** hat **-${actual.toLocaleString('de-DE')} Jetons** verloren!\n\n` +
          `Neues Guthaben: **${newBal.toLocaleString('de-DE')} Jetons**` +
          (actual < amount ? `\n\n\u26A0\uFE0F Nur ${actual.toLocaleString('de-DE')} Jetons verf\xFCgbar \u2013 alles abgezogen.` : '')
        )
        .setColor(0xFF3D00)
        .setFooter({ text: `Abgezogen von: ${interaction.user.username}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'slot-machine') {
      const bal = eco.get(interaction.user.id);
      if (bal < 10)
        return interaction.reply({
          content: '\uD83D\uDED2 Du brauchst mindestens **10 Jetons** zum Spielen!\nBitte einen Admin um Hilfe mit `/jetons-give`.',
          ephemeral: true,
        });
      sessions.set(interaction.user.id, { bet: 10, spinning: false });
      return interaction.reply({
        embeds: [sm.buildBetEmbed(bal)],
        components: sm.betRows(bal, interaction.user.id),
      });
    }
  }

  if (interaction.isButton()) {
    const { customId } = interaction;
    if (!customId.startsWith('sm|')) return;

    const parts   = customId.split('|');
    const action  = parts[1];
    const ownerId = parts[parts.length - 1];

    if (interaction.user.id !== ownerId)
      return interaction.reply({ content: '\u274C Das ist nicht deine Slot Machine!', ephemeral: true });

    const session = sessions.get(ownerId);

    if (action === 'quit') {
      sessions.delete(ownerId);
      const embed = new EmbedBuilder()
        .setTitle('\uD83C\uDFB0 Slot Machine beendet')
        .setDescription(
          'Du hast die Slot Machine verlassen.\n\n' +
          `\uD83C\uDFE6 Dein Guthaben: **${eco.get(ownerId).toLocaleString('de-DE')} Jetons**\n\n` +
          'Bis zum n\xE4chsten Mal! \uD83C\uDFB0'
        )
        .setColor(0x607D8B)
        .setFooter({ text: 'GTA RP Casino' });
      return interaction.update({ embeds: [embed], components: [] });
    }

    if (action === 'changebeta') {
      const bal = eco.get(ownerId);
      return interaction.update({
        embeds: [sm.buildBetEmbed(bal)],
        components: sm.betRows(bal, ownerId),
      });
    }

    if (action === 'continue') {
      if (!session)
        return interaction.reply({ content: '\u274C Sitzung abgelaufen. Nutze `/slot-machine` um neu zu starten.', ephemeral: true });
      if (session.spinning)
        return interaction.reply({ content: '\u23F3 Die Maschine dreht sich noch!', ephemeral: true });
      return runSpin(interaction, ownerId, session.bet);
    }

    if (action === 'bet') {
      const bet = parseInt(parts[2]);
      const bal = eco.get(ownerId);
      if (bal < bet)
        return interaction.reply({
          content: `\u274C Nicht genug Jetons! Du hast **${bal.toLocaleString('de-DE')} Jetons**.`,
          ephemeral: true,
        });
      sessions.set(ownerId, { bet, spinning: false });
      return runSpin(interaction, ownerId, bet);
    }
  }
});

async function runSpin(interaction, userId, bet) {
  const session = sessions.get(userId);
  if (session) session.spinning = true;

  const balBefore = eco.get(userId);
  if (balBefore < bet) {
    if (session) session.spinning = false;
    return interaction.reply({
      content: `\u274C Nicht genug Jetons! Du hast **${balBefore.toLocaleString('de-DE')} Jetons**.`,
      ephemeral: true,
    });
  }

  eco.remove(userId, bet);

  const reels  = sm.spin();
  const result = sm.calcWin(reels, bet);
  if (result.win > 0) eco.add(userId, result.win);

  const finalBal = eco.get(userId);

  await interaction.deferUpdate();

  try {
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 0)], components: [] });
    await sleep(1300);
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 1)], components: [] });
    await sleep(1300);
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 2)], components: [] });
    await sleep(1300);
    await interaction.editReply({
      embeds: [sm.buildResultEmbed(reels, bet, result, finalBal)],
      components: sm.gameRows(bet, finalBal, userId),
    });
  } catch (err) {
    console.error('[FEHLER] Slot-Animation:', err.message);
  }

  if (session) session.spinning = false;
}

client.login(TOKEN);
