require('dotenv').config();

const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder,
  MessageFlags, PermissionFlagsBits,
} = require('discord.js');

const eco = require('./economy');
const sm  = require('./slotMachine');
const hr  = require('./horseRace');
const bj  = require('./blackjack');

const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const ADMIN_ROLE = '1495237353529151528';

if (!TOKEN)     { console.error('[FEHLER] DISCORD_TOKEN fehlt!'); process.exit(1); }
if (!CLIENT_ID) { console.error('[FEHLER] CLIENT_ID fehlt!');     process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sessions   = new Map();
const hrSessions = new Map();
const bjSessions = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName('jetons')
    .setDescription('Zeigt deinen aktuellen Jetons-Stand'),

  new SlashCommandBuilder()
    .setName('jetons-give')
    .setDescription('Gibt einem Spieler Jetons [Nur Staff]')
    .addUserOption((o) => o.setName('spieler').setDescription('Welchem Spieler?').setRequired(true))
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Jetons?').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('jetons-remove')
    .setDescription('Nimmt einem Spieler Jetons [Nur Staff]')
    .addUserOption((o) => o.setName('spieler').setDescription('Welchem Spieler?').setRequired(true))
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Jetons?').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('L\xF6scht Nachrichten [Nur Staff]')
    .addIntegerOption((o) => o.setName('menge').setDescription('Wie viele Nachrichten? (1\u2013100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('slot-machine')
    .setDescription('\uD83C\uDFB0 Spiele an der Slot Machine'),

  new SlashCommandBuilder()
    .setName('inside-track')
    .setDescription('\uD83C\uDFB4 Pferde-Rennen im Inside Track'),

  new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('\uD83C\uDCCF Spiele eine Runde Blackjack'),
].map((c) => c.toJSON());

function isAdmin(interaction) {
  if (!interaction.guild) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  return interaction.member?.roles?.cache?.has(ADMIN_ROLE) ?? false;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`[INFO] Bot online als: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[INFO] Slash Commands erfolgreich registriert!');
  } catch (e) {
    console.error('[FEHLER] Commands konnten nicht registriert werden:', e.message);
  }
});

client.on('interactionCreate', async (interaction) => {

  /* ─── SLASH COMMANDS ─── */
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
        .setColor(0x00BFFF)
        .setFooter({ text: 'The Diamond Casino Richman' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (cmd === 'jetons-give') {
      if (!isAdmin(interaction))
        return interaction.reply({ content: '\u274C Du hast keine Berechtigung!', flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('spieler');
      const amount = interaction.options.getInteger('menge');
      const newBal = eco.add(target.id, amount);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('\uD83D\uDCB8 Jetons hinzugef\xFCgt')
          .setDescription(`**${target.username}** hat **+${amount.toLocaleString('de-DE')} Jetons** erhalten!\nNeues Guthaben: **${newBal.toLocaleString('de-DE')} Jetons**`)
          .setColor(0x00BFFF)
          .setFooter({ text: `Vergeben von: ${interaction.user.username} \u2022 The Diamond Casino Richman` })
          .setTimestamp()],
      });
    }

    if (cmd === 'jetons-remove') {
      if (!isAdmin(interaction))
        return interaction.reply({ content: '\u274C Du hast keine Berechtigung!', flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser('spieler');
      const amount = interaction.options.getInteger('menge');
      const cur    = eco.get(target.id);
      const actual = Math.min(amount, cur);
      const newBal = eco.remove(target.id, actual);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('\uD83D\uDCB8 Jetons abgezogen')
          .setDescription(
            `**${target.username}** hat **-${actual.toLocaleString('de-DE')} Jetons** verloren!\nNeues Guthaben: **${newBal.toLocaleString('de-DE')} Jetons**` +
            (actual < amount ? `\n\n\u26A0\uFE0F Nur ${actual.toLocaleString('de-DE')} Jetons verf\xFCgbar \u2013 alles abgezogen.` : '')
          )
          .setColor(0x00BFFF)
          .setFooter({ text: `Abgezogen von: ${interaction.user.username} \u2022 The Diamond Casino Richman` })
          .setTimestamp()],
      });
    }

    if (cmd === 'delete') {
      if (!isAdmin(interaction))
        return interaction.reply({ content: '\u274C Du hast keine Berechtigung!', flags: MessageFlags.Ephemeral });
      const amount = interaction.options.getInteger('menge');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.editReply({ content: `\u2705 **${deleted.size}** Nachricht(en) gel\xF6scht.` });
      } catch (e) {
        return interaction.editReply({ content: `\u274C Fehler: ${e.message}` });
      }
    }

    if (cmd === 'slot-machine') {
      const bal = eco.get(interaction.user.id);
      if (bal < 1000)
        return interaction.reply({
          content: '\uD83D\uDED2 Du brauchst mindestens **1.000 Jetons** zum Spielen!\nBitte einen Admin um Hilfe mit `/jetons-give`.',
          flags: MessageFlags.Ephemeral,
        });
      sessions.set(interaction.user.id, { bet: 0, spinning: false });
      return interaction.showModal(sm.buildModal(interaction.user.id));
    }

    if (cmd === 'inside-track') {
      const bal = eco.get(interaction.user.id);
      if (bal < 1000)
        return interaction.reply({
          content: '\uD83D\uDED2 Du brauchst mindestens **1.000 Jetons** zum Spielen!\nBitte einen Admin um Hilfe mit `/jetons-give`.',
          flags: MessageFlags.Ephemeral,
        });
      return interaction.showModal(hr.buildModal(interaction.user.id));
    }

    if (cmd === 'blackjack') {
      const bal = eco.get(interaction.user.id);
      if (bal < 1000)
        return interaction.reply({
          content: '\uD83D\uDED2 Du brauchst mindestens **1.000 Jetons** zum Spielen!\nBitte einen Admin um Hilfe mit `/jetons-give`.',
          flags: MessageFlags.Ephemeral,
        });
      return interaction.showModal(bj.buildModal(interaction.user.id));
    }
  }

  /* ─── MODAL SUBMITS ─── */
  if (interaction.isModalSubmit()) {
    const { customId } = interaction;

    /* Slot Machine */
    if (customId.startsWith('sm|modal|')) {
      const userId = customId.split('|')[2];
      if (interaction.user.id !== userId) return;
      const raw = interaction.fields.getTextInputValue('bet_amount');
      const bet = sm.parseBet(raw);
      if (isNaN(bet) || bet < 1000 || bet > 250000)
        return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz! Bitte zwischen **1.000** und **250.000** Jetons. Beispiel: `5000` oder `50K`', flags: MessageFlags.Ephemeral });
      const bal = eco.get(userId);
      if (bal < bet)
        return interaction.reply({ content: `\u274C Nicht genug Jetons!\nDu hast **${bal.toLocaleString('de-DE')} Jetons**, brauchst aber **${bet.toLocaleString('de-DE')} Jetons**.`, flags: MessageFlags.Ephemeral });
      sessions.set(userId, { bet, spinning: false });
      await runSpin(interaction, userId, bet, true);
      return;
    }

    /* Horse Race */
    if (customId.startsWith('hr|modal|')) {
      const userId = customId.split('|')[2];
      if (interaction.user.id !== userId) return;
      const raw = interaction.fields.getTextInputValue('bet_amount');
      const bet = sm.parseBet(raw);
      if (isNaN(bet) || bet < 1000 || bet > 250000)
        return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz! Bitte zwischen **1.000** und **250.000** Jetons.', flags: MessageFlags.Ephemeral });
      const bal = eco.get(userId);
      if (bal < bet)
        return interaction.reply({ content: `\u274C Nicht genug Jetons!\nDu hast **${bal.toLocaleString('de-DE')} Jetons**, brauchst aber **${bet.toLocaleString('de-DE')} Jetons**.`, flags: MessageFlags.Ephemeral });
      hrSessions.set(userId, { bet, running: false });
      return interaction.reply({ embeds: [hr.buildSelectEmbed(bet)], components: hr.selectRows(userId) });
    }

    /* Blackjack */
    if (customId.startsWith('bj|modal|')) {
      const userId = customId.split('|')[2];
      if (interaction.user.id !== userId) return;
      const raw = interaction.fields.getTextInputValue('bet_amount');
      const bet = sm.parseBet(raw);
      if (isNaN(bet) || bet < 1000 || bet > 250000)
        return interaction.reply({ content: '\u274C Ung\xFCltiger Einsatz! Bitte zwischen **1.000** und **250.000** Jetons.', flags: MessageFlags.Ephemeral });
      const bal = eco.get(userId);
      if (bal < bet)
        return interaction.reply({ content: `\u274C Nicht genug Jetons!\nDu hast **${bal.toLocaleString('de-DE')} Jetons**, brauchst aber **${bet.toLocaleString('de-DE')} Jetons**.`, flags: MessageFlags.Ephemeral });
      await startBlackjack(interaction, userId, bet, true);
      return;
    }
  }

  /* ─── BUTTONS ─── */
  if (interaction.isButton()) {
    const { customId } = interaction;

    /* ── Slot Machine buttons ── */
    if (customId.startsWith('sm|')) {
      const parts   = customId.split('|');
      const action  = parts[1];
      const ownerId = parts[parts.length - 1];
      if (interaction.user.id !== ownerId)
        return interaction.reply({ content: '\u274C Das ist nicht deine Slot Machine!', flags: MessageFlags.Ephemeral });
      const session = sessions.get(ownerId);
      if (action === 'quit') {
        sessions.delete(ownerId);
        return interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle('\uD83C\uDFB0 Slot Machine beendet')
            .setDescription(`Du hast die Slot Machine verlassen.\n\n\uD83C\uDFE6 Guthaben: **${eco.get(ownerId).toLocaleString('de-DE')} Jetons**\n\nBis zum n\xE4chsten Mal! \uD83C\uDFB0`)
            .setColor(0x00BFFF).setFooter({ text: 'The Diamond Casino Richman' })],
          components: [],
        });
      }
      if (action === 'changebeta') return interaction.showModal(sm.buildModal(ownerId));
      if (action === 'continue') {
        if (!session) return interaction.reply({ content: '\u274C Sitzung abgelaufen. Nutze `/slot-machine` neu.', flags: MessageFlags.Ephemeral });
        if (session.spinning) return interaction.reply({ content: '\u23F3 Die Maschine dreht sich noch!', flags: MessageFlags.Ephemeral });
        await runSpin(interaction, ownerId, session.bet, false);
      }
      return;
    }

    /* ── Horse Race buttons ── */
    if (customId.startsWith('hr|')) {
      const parts   = customId.split('|');
      const action  = parts[1];
      const ownerId = parts[parts.length - 1];
      if (interaction.user.id !== ownerId)
        return interaction.reply({ content: '\u274C Das ist nicht dein Rennen!', flags: MessageFlags.Ephemeral });
      const session = hrSessions.get(ownerId);

      if (action === 'quit') {
        hrSessions.delete(ownerId);
        return interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle('\uD83C\uDFB4 Inside Track beendet')
            .setDescription(`\uD83C\uDFE6 Guthaben: **${eco.get(ownerId).toLocaleString('de-DE')} Jetons**\n\nBis zum n\xE4chsten Rennen! \uD83C\uDFB4`)
            .setColor(0x00BFFF).setFooter({ text: 'The Diamond Casino Richman \u2013 Inside Track' })],
          components: [],
        });
      }

      if (action === 'again') {
        const bal = eco.get(ownerId);
        if (bal < 1000)
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle('\uD83C\uDFB4 Inside Track').setDescription('\uD83D\uDED2 Nicht genug Jetons f\xFCr eine neue Runde!').setColor(0x00BFFF)],
            components: [],
          });
        hrSessions.set(ownerId, { bet: session?.bet ?? 1000, running: false });
        return interaction.showModal(hr.buildModal(ownerId));
      }

      if (action === 'pick') {
        if (!session || session.running)
          return interaction.reply({ content: '\u274C Keine aktive Sitzung oder Rennen l\xE4uft bereits.', flags: MessageFlags.Ephemeral });
        const horseId     = parseInt(parts[2], 10);
        const pickedHorse = hr.HORSES[horseId];
        const { bet }     = session;
        const bal         = eco.get(ownerId);
        if (bal < bet)
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle('\uD83C\uDFB4 Inside Track').setDescription(`\u274C Nicht genug Jetons!\nDu hast **${bal.toLocaleString('de-DE')} Jetons**, brauchst aber **${bet.toLocaleString('de-DE')} Jetons**.`).setColor(0x00BFFF)],
            components: [],
          });
        session.running = true;
        await interaction.deferUpdate();
        const winner   = hr.pickWinner();
        const raceData = hr.simulateRace(winner.id);
        eco.remove(ownerId, bet);
        for (let f = 1; f <= 5; f++) {
          await interaction.editReply({ embeds: [hr.buildRaceEmbed(raceData, f, pickedHorse, bet)], components: [] });
          await sleep(1200);
        }
        const payout   = winner.id === pickedHorse.id ? Math.floor(bet * pickedHorse.odds) : 0;
        if (payout > 0) eco.add(ownerId, payout);
        const finalBal = eco.get(ownerId);
        await interaction.editReply({ embeds: [hr.buildResultEmbed(raceData, winner, pickedHorse, bet, payout, finalBal)], components: hr.endRow(ownerId) });
        session.running = false;
      }
      return;
    }

    /* ── Blackjack buttons ── */
    if (customId.startsWith('bj|')) {
      const parts   = customId.split('|');
      const action  = parts[1];
      const ownerId = parts[parts.length - 1];
      if (interaction.user.id !== ownerId)
        return interaction.reply({ content: '\u274C Das ist nicht dein Blackjack!', flags: MessageFlags.Ephemeral });
      const session = bjSessions.get(ownerId);

      if (action === 'quit') {
        bjSessions.delete(ownerId);
        return interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle('\uD83C\uDCCF Blackjack beendet')
            .setDescription(`\uD83C\uDFE6 Guthaben: **${eco.get(ownerId).toLocaleString('de-DE')} Jetons**\n\nBis zum n\xE4chsten Mal! \uD83C\uDCCF`)
            .setColor(0x00BFFF).setFooter({ text: 'The Diamond Casino Richman \u2013 Blackjack' })],
          components: [],
        });
      }

      if (action === 'again') {
        const bal = eco.get(ownerId);
        if (bal < 1000)
          return interaction.update({
            embeds: [new EmbedBuilder().setTitle('\uD83C\uDCCF Blackjack').setDescription('\uD83D\uDED2 Nicht genug Jetons f\xFCr eine neue Runde!').setColor(0x00BFFF)],
            components: [],
          });
        return interaction.showModal(bj.buildModal(ownerId));
      }

      if (!session)
        return interaction.reply({ content: '\u274C Keine aktive Sitzung. Starte mit `/blackjack` neu.', flags: MessageFlags.Ephemeral });

      await interaction.deferUpdate();
      const { deck, playerHand, dealerHand, bet } = session;

      if (action === 'hit') {
        playerHand.push(deck.pop());
        const val  = bj.handValue(playerHand);
        const bal  = eco.get(ownerId);
        if (val > 21) {
          bjSessions.delete(ownerId);
          return interaction.editReply({
            embeds: [bj.buildGameEmbed(playerHand, dealerHand, bet, bal, `\uD83D\uDCA5 **\xDCberkauft! (${val})** \u2014 Verlust: **-${bet.toLocaleString('de-DE')} Jetons**`, false)],
            components: bj.endRow(ownerId),
          });
        }
        if (val === 21) {
          return bjStand(interaction, ownerId, session);
        }
        session.canDouble = false;
        return interaction.editReply({
          embeds: [bj.buildGameEmbed(playerHand, dealerHand, bet, eco.get(ownerId), '', true)],
          components: bj.gameButtons(ownerId, false, eco.get(ownerId), bet),
        });
      }

      if (action === 'stand') {
        return bjStand(interaction, ownerId, session);
      }

      if (action === 'double') {
        const extraBet = session.bet;
        const bal      = eco.get(ownerId);
        if (bal < extraBet)
          return interaction.editReply({ embeds: [bj.buildGameEmbed(playerHand, dealerHand, bet, bal, '\u274C Nicht genug Jetons zum Verdoppeln!', true)], components: bj.gameButtons(ownerId, false, bal, bet) });
        eco.remove(ownerId, extraBet);
        session.bet *= 2;
        playerHand.push(deck.pop());
        const val = bj.handValue(playerHand);
        if (val > 21) {
          bjSessions.delete(ownerId);
          const balNow = eco.get(ownerId);
          return interaction.editReply({
            embeds: [bj.buildGameEmbed(playerHand, dealerHand, session.bet, balNow, `\uD83D\uDCA5 **\xDCberkauft! (${val})** \u2014 Verlust: **-${session.bet.toLocaleString('de-DE')} Jetons**`, false)],
            components: bj.endRow(ownerId),
          });
        }
        return bjStand(interaction, ownerId, session);
      }
    }
  }
});

/* ─── Blackjack: Dealer spielt + Ergebnis ─── */
async function bjStand(interaction, userId, session) {
  const { deck, playerHand, dealerHand, bet } = session;
  while (bj.handValue(dealerHand) < 17) dealerHand.push(deck.pop());
  const pVal = bj.handValue(playerHand);
  const dVal = bj.handValue(dealerHand);
  let status, payout = 0;
  const isNatural = bj.isBlackjack(playerHand);
  if (dVal > 21 || pVal > dVal) {
    payout = isNatural ? Math.floor(bet * 2.5) : bet * 2;
    eco.add(userId, payout);
    status = isNatural
      ? `\uD83C\uDCCF\u2728 **BLACKJACK!** Gewinn: **+${(payout - bet).toLocaleString('de-DE')} Jetons**`
      : `\uD83C\uDFC6 **Gewonnen!** Gewinn: **+${bet.toLocaleString('de-DE')} Jetons**`;
  } else if (pVal === dVal) {
    eco.add(userId, bet);
    payout = bet;
    status = `\uD83E\uDD1D **Unentschieden!** Einsatz zur\xFCck.`;
  } else {
    status = `\uD83D\uDC94 **Verloren!** Verlust: **-${bet.toLocaleString('de-DE')} Jetons**`;
  }
  bjSessions.delete(userId);
  return interaction.editReply({
    embeds: [bj.buildGameEmbed(playerHand, dealerHand, bet, eco.get(userId), status, false)],
    components: bj.endRow(userId),
  });
}

/* ─── Blackjack starten ─── */
async function startBlackjack(interaction, userId, bet, isNew) {
  if (isNew) await interaction.deferReply();
  else await interaction.deferUpdate();
  eco.remove(userId, bet);
  const deck       = bj.createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  bjSessions.set(userId, { bet, deck, playerHand, dealerHand, canDouble: true });
  const bal = eco.get(userId);
  if (bj.isBlackjack(playerHand)) {
    return bjStand({ deferUpdate: async () => {}, editReply: (d) => interaction.editReply(d) }, userId, bjSessions.get(userId));
  }
  return interaction.editReply({
    embeds: [bj.buildGameEmbed(playerHand, dealerHand, bet, bal, '', true)],
    components: bj.gameButtons(userId, true, bal, bet),
  });
}

/* ─── Slot Machine Spin ─── */
async function runSpin(interaction, userId, bet, isModal) {
  if (isModal) await interaction.deferReply();
  else         await interaction.deferUpdate();

  const session   = sessions.get(userId);
  if (session) session.spinning = true;

  const balBefore = eco.get(userId);
  if (balBefore < bet) {
    if (session) session.spinning = false;
    return interaction.editReply({ content: `\u274C Nicht genug Jetons!\nDu hast **${balBefore.toLocaleString('de-DE')} Jetons**, brauchst aber **${bet.toLocaleString('de-DE')} Jetons**.` });
  }

  eco.remove(userId, bet);
  const reels  = sm.spin(bet);
  const result = sm.calcWin(reels, bet);
  if (result.win > 0) eco.add(userId, result.win);
  const finalBal = eco.get(userId);

  try {
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 0)], components: [] });
    await sleep(1300);
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 1)], components: [] });
    await sleep(1300);
    await interaction.editReply({ embeds: [sm.buildSpinEmbed(reels, bet, balBefore, 2)], components: [] });
    await sleep(1300);
    await interaction.editReply({ embeds: [sm.buildResultEmbed(reels, bet, result, finalBal)], components: sm.gameRows(bet, finalBal, userId) });
  } catch (err) {
    console.error('[FEHLER] Slot-Animation:', err.message);
  }

  if (session) session.spinning = false;
}

client.login(TOKEN);
