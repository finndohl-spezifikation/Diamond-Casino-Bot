const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const LIGHT_BLUE  = 0x00BFFF;
const BRAND       = 'The Diamond Casino Richman';
const MAX_PLAYERS = 4;

const SUITS = ['\u2665', '\u2666', '\u2663', '\u2660'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV    = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

const HAND_NAMES = [
  'High Card', 'Ein Paar', 'Flush', 'Stra\xDFe',
  'Drilling', 'Straight Flush', 'Mini Royal',
];

/* ── Deck ── */
function createDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d.sort(() => Math.random() - 0.5);
}

function fmt(c)  { return `${c.rank}${c.suit}`; }
function fmtH(h) { return h.map(fmt).join(' '); }

/* ── 3-Karten Hand Evaluation ── */
function evalThree(cards) {
  const vals  = cards.map((c) => RV[c.rank]).sort((a, b) => b - a);
  const flush = new Set(cards.map((c) => c.suit)).size === 1;
  const cnt   = {};
  vals.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
  const freq  = Object.entries(cnt).sort((a, b) => b[1] - a[1] || +b[0] - +a[0]);

  const normalStr = new Set(vals).size === 3 && vals[0] - vals[2] === 2;
  const lowStr    = vals[0] === 14 && vals[1] === 3 && vals[2] === 2; // A-2-3
  const isStraight = normalStr || lowStr;
  const strHigh   = lowStr ? 3 : vals[0];
  const miniRoyal = flush && vals[0] === 14 && vals[1] === 13 && vals[2] === 12; // A-K-Q suited

  if (miniRoyal)              return [6, 14, 13, 12];        // Mini Royal
  if (flush && isStraight)    return [5, strHigh];           // Straight Flush
  if (freq[0][1] === 3)       return [4, +freq[0][0]];       // Drilling
  if (isStraight)             return [3, strHigh];           // Stra\xDFe
  if (flush)                  return [2, ...vals];           // Flush
  if (freq[0][1] === 2)       return [1, +freq[0][0], ...vals]; // Ein Paar
  return [0, ...vals];                                       // High Card
}

function cmpScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/* ── Session ── */
function createSession(hostId, hostName, bet) {
  return {
    phase: 'lobby',
    players: [createPlayer(hostId, hostName, bet)],
    deck: null, message: null,
  };
}

function createPlayer(userId, username, bet) {
  return { userId, username, bet, hand: [], payout: 0 };
}

/* ── Embeds ── */
function buildLobbyEmbed(session) {
  const rows = session.players
    .map((p) => `\uD83D\uDCB0 <@${p.userId}> \u2014 **${p.bet.toLocaleString('de-DE')} Jetons**`)
    .join('\n');
  return new EmbedBuilder()
    .setTitle('\uD83C\uDCCF 3-Karten Poker \u2013 Lobby')
    .setDescription(`${rows}\n\n_Bis zu ${MAX_PLAYERS} Spieler k\xF6nnen beitreten. Gastgeber startet das Spiel._`)
    .setColor(LIGHT_BLUE)
    .setFooter({ text: `${session.players.length}/${MAX_PLAYERS} Spieler \u2022 ${BRAND}` })
    .setTimestamp();
}

function buildDealtEmbed(session) {
  const pot   = session.players.reduce((s, p) => s + p.bet, 0);
  const rows  = session.players
    .map((p) => `\uD83C\uDCCF **${p.username}** \u2014 \uD83C\uDCCF \uD83C\uDCCF \uD83C\uDCCF (verdeckt)`)
    .join('\n');
  return new EmbedBuilder()
    .setTitle('\uD83C\uDCCF 3-Karten Poker \u2013 Karten ausgeteilt!')
    .addFields(
      { name: '\uD83D\uDC65 Spieler', value: rows },
      { name: '\uD83D\uDCB0 Pot',    value: `**${pot.toLocaleString('de-DE')} Jetons**`, inline: true },
    )
    .setDescription('_Karten sind ausgeteilt. Gastgeber deckt auf!_')
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND })
    .setTimestamp();
}

function buildShowdownEmbed(session) {
  const pot = session.players.reduce((s, p) => s + p.bet, 0);
  const embed = new EmbedBuilder()
    .setTitle('\uD83C\uDCCF 3-Karten Poker \u2013 Showdown!')
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND })
    .setTimestamp();

  for (const p of session.players) {
    const score = evalThree(p.hand);
    const name  = HAND_NAMES[score[0]] ?? 'Unbekannt';
    const won   = p.payout > 0;
    embed.addFields({
      name:  `${won ? '\uD83C\uDF89' : '\uD83D\uDCB8'} ${p.username}`,
      value: `Karten: **${fmtH(p.hand)}**\nHand: **${name}**\n${won ? `**+${(p.payout - p.bet).toLocaleString('de-DE')} Jetons**` : `**-${p.bet.toLocaleString('de-DE')} Jetons**`}`,
      inline: true,
    });
  }
  embed.addFields({ name: '\uD83D\uDCB0 Pot', value: `**${pot.toLocaleString('de-DE')} Jetons**`, inline: false });
  return embed;
}

/* ── Buttons ── */
function lobbyButtons(hostId, full) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pk|join|${hostId}`).setLabel('\uD83D\uDD11 Mitspielen').setStyle(ButtonStyle.Success).setDisabled(full),
    new ButtonBuilder().setCustomId(`pk|start|${hostId}`).setLabel('\u25B6\uFE0F Spiel starten').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pk|quit|${hostId}`).setLabel('\u274C Beenden').setStyle(ButtonStyle.Danger),
  )];
}

function revealButton(hostId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pk|showdown|${hostId}`).setLabel('\uD83C\uDCCF Karten aufdecken!').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pk|quit|${hostId}`).setLabel('\u274C Beenden').setStyle(ButtonStyle.Danger),
  )];
}

function endRow(hostId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pk|again|${hostId}`).setLabel('\uD83D\uDD01 Neue Runde').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pk|quit|${hostId}`).setLabel('\u274C Beenden').setStyle(ButtonStyle.Danger),
  )];
}

/* ── Modals ── */
function buildModal(userId) {
  const modal = new ModalBuilder().setCustomId(`pk|modal|${userId}`).setTitle('\uD83C\uDCCF 3-Karten Poker \u2013 Einsatz');
  const input = new TextInputBuilder()
    .setCustomId('bet_amount')
    .setLabel('Einsatz zwischen 1K und 250K')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('z.B. 5000 oder 50K');
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

function buildJoinModal(hostId) {
  const modal = new ModalBuilder().setCustomId(`pk|joinmodal|${hostId}`).setTitle('\uD83C\uDCCF 3-Karten Poker \u2013 Einsatz');
  const input = new TextInputBuilder()
    .setCustomId('bet_amount')
    .setLabel('Einsatz zwischen 1K und 250K')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('z.B. 5000 oder 50K');
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

module.exports = {
  MAX_PLAYERS, createDeck, evalThree, cmpScore, HAND_NAMES, fmtH,
  createSession, createPlayer,
  buildLobbyEmbed, buildDealtEmbed, buildShowdownEmbed,
  lobbyButtons, revealButton, endRow,
  buildModal, buildJoinModal,
};
