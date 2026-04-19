const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const LIGHT_BLUE = 0x00BFFF;
const BRAND      = 'The Diamond Casino Richman';
const MAX_PLAYERS = 4;

const RED_NR = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function getColor(n) {
  if (n === 0) return 'green';
  return RED_NR.has(n) ? 'red' : 'black';
}

const BET_TYPES = {
  rot:     { label: 'Rot',      emoji: '\uD83D\uDD34', check: (n) => getColor(n) === 'red',           payout: 2 },
  schwarz: { label: 'Schwarz',  emoji: '\u26AB',       check: (n) => getColor(n) === 'black',          payout: 2 },
  gerade:  { label: 'Gerade',   emoji: '\u2696\uFE0F', check: (n) => n > 0 && n % 2 === 0,             payout: 2 },
  ungerade:{ label: 'Ungerade', emoji: '\uD83D\uDD22', check: (n) => n % 2 === 1,                      payout: 2 },
  low:     { label: '1\u201318',  emoji: '\uD83D\uDD3D', check: (n) => n >= 1 && n <= 18,              payout: 2 },
  high:    { label: '19\u201336', emoji: '\uD83D\uDD3C', check: (n) => n >= 19 && n <= 36,             payout: 2 },
  zahl:    { label: 'Zahl',     emoji: '\uD83C\uDFB2', check: null,                                    payout: 36 },
};

function spin() { return Math.floor(Math.random() * 37); }

function createSession(hostId, hostName, bet) {
  return {
    phase: 'lobby',
    players: [{ userId: hostId, username: hostName, bet, betType: null, number: null, ready: false }],
    result: null,
    message: null,
  };
}

function allReady(session) { return session.players.every((p) => p.ready); }

function buildLobbyEmbed(session) {
  const rows = session.players.map((p) => {
    const bt = BET_TYPES[p.betType];
    const betStr = p.ready
      ? `**${p.bet.toLocaleString('de-DE')} Jetons** auf ${bt.label}${p.betType === 'zahl' && p.number !== null ? ` (**${p.number}**)` : ''} \u2705`
      : '\u23F3 W\xE4hlt noch...';
    return `\uD83D\uDCB0 <@${p.userId}> \u2014 ${betStr}`;
  }).join('\n');

  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB2 Roulette \u2013 Lobby')
    .setDescription(`${rows}\n\n_Warte auf alle Spieler, dann klickt der Gastgeber auf \u201EDrehen!\u201C_`)
    .setColor(LIGHT_BLUE)
    .setFooter({ text: `${session.players.length}/${MAX_PLAYERS} Spieler \u2022 ${BRAND}` })
    .setTimestamp();
}

function lobbyButtons(hostId, full, ready) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rl|join|${hostId}`).setLabel('\uD83D\uDD11 Mitspielen').setStyle(ButtonStyle.Success).setDisabled(full),
    new ButtonBuilder().setCustomId(`rl|spin|${hostId}`).setLabel('\uD83C\uDFB0 Drehen!').setStyle(ButtonStyle.Primary).setDisabled(!ready),
    new ButtonBuilder().setCustomId(`rl|quit|${hostId}`).setLabel('\u274C Beenden').setStyle(ButtonStyle.Danger),
  )];
}

function betTypeRows(hostId, userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rl|bet|rot|${hostId}|${userId}`).setLabel('Rot').setEmoji('\uD83D\uDD34').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`rl|bet|schwarz|${hostId}|${userId}`).setLabel('Schwarz').setEmoji('\u26AB').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rl|bet|gerade|${hostId}|${userId}`).setLabel('Gerade').setEmoji('\u2696\uFE0F').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rl|bet|ungerade|${hostId}|${userId}`).setLabel('Ungerade').setEmoji('\uD83D\uDD22').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rl|bet|low|${hostId}|${userId}`).setLabel('1\u201318').setEmoji('\uD83D\uDD3D').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rl|bet|high|${hostId}|${userId}`).setLabel('19\u201336').setEmoji('\uD83D\uDD3C').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rl|betzahl|${hostId}|${userId}`).setLabel('Zahl (35:1)').setEmoji('\uD83C\uDFB2').setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildBetSelectEmbed(username, bet) {
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB2 Setze deinen Wetteinsatz')
    .setDescription(`**${username}**, du setzt **${bet.toLocaleString('de-DE')} Jetons**.\n\nW\xE4hle womit du wettest:`)
    .addFields(
      { name: '\uD83D\uDD34 Rot / \u26AB Schwarz', value: '1:1 \u2192 2x Gewinn',   inline: true },
      { name: '\u2696\uFE0F Gerade / Ungerade',    value: '1:1 \u2192 2x Gewinn',   inline: true },
      { name: '\uD83D\uDD3D 1\u201318 / 19\u201336',  value: '1:1 \u2192 2x Gewinn', inline: true },
      { name: '\uD83C\uDFB2 Zahl',                 value: '35:1 \u2192 36x Gewinn', inline: true },
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND });
}

function buildResultEmbed(session) {
  const n   = session.result;
  const col = getColor(n);
  const colEmoji = col === 'green' ? '\uD83D\uDFE2' : col === 'red' ? '\uD83D\uDD34' : '\u26AB';
  const colLabel = col === 'green' ? 'Gr\xFCn' : col === 'red' ? 'Rot' : 'Schwarz';

  let desc = `${colEmoji} **${n}** \u2014 ${colLabel}\n\n`;
  for (const p of session.players) {
    const bt  = BET_TYPES[p.betType];
    const won = p.payout > 0;
    const betStr = p.betType === 'zahl' ? `Zahl **${p.number}**` : `**${bt.label}**`;
    desc += won
      ? `\uD83C\uDF89 <@${p.userId}> \u2014 ${betStr} \u2192 **+${(p.payout - p.bet).toLocaleString('de-DE')} Jetons**\n`
      : `\uD83D\uDCB8 <@${p.userId}> \u2014 ${betStr} \u2192 **-${p.bet.toLocaleString('de-DE')} Jetons**\n`;
  }

  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB2 Roulette \u2013 Ergebnis')
    .setDescription(desc)
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND })
    .setTimestamp();
}

function endRow(hostId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rl|again|${hostId}`).setLabel('\uD83D\uDD01 Neue Runde').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rl|quit|${hostId}`).setLabel('\u274C Beenden').setStyle(ButtonStyle.Danger),
  )];
}

function buildModal(userId) {
  const modal = new ModalBuilder().setCustomId(`rl|modal|${userId}`).setTitle('\uD83C\uDFB2 Roulette \u2013 Einsatz');
  const input = new TextInputBuilder().setCustomId('bet_amount').setLabel('Einsatz (z.B. 5000 oder 5K)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('5000');
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

function buildJoinModal(hostId) {
  const modal = new ModalBuilder().setCustomId(`rl|joinmodal|${hostId}`).setTitle('\uD83C\uDFB2 Roulette \u2013 Einsatz');
  const input = new TextInputBuilder().setCustomId('bet_amount').setLabel('Einsatz (z.B. 5000 oder 5K)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('5000');
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

function buildZahlModal(hostId, userId) {
  const modal = new ModalBuilder().setCustomId(`rl|zahlmodal|${hostId}|${userId}`).setTitle('\uD83C\uDFB2 Zahl eingeben');
  const input = new TextInputBuilder().setCustomId('zahl').setLabel('Zahl von 0 bis 36').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('17');
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

module.exports = {
  MAX_PLAYERS, BET_TYPES, getColor, spin, allReady,
  createSession, buildLobbyEmbed, lobbyButtons,
  betTypeRows, buildBetSelectEmbed, buildResultEmbed, endRow,
  buildModal, buildJoinModal, buildZahlModal,
};
