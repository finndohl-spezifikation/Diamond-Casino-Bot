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
  'High Card', 'Ein Paar', 'Zwei Paare', 'Drilling',
  'Stra\xDFe', 'Flush', 'Full House', 'Vierling',
  'Straight Flush', 'Royal Flush',
];

/* ── Deck ── */
function createDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d.sort(() => Math.random() - 0.5);
}

function fmt(c)  { return `${c.rank}${c.suit}`; }
function fmtH(h) { return h.map(fmt).join(' '); }

/* ── Hand Evaluation ── */
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const res = [];
  for (let i = 0; i <= arr.length - k; i++) {
    for (const c of combinations(arr.slice(i + 1), k - 1)) res.push([arr[i], ...c]);
  }
  return res;
}

function evalFive(cards) {
  const vals  = cards.map((c) => RV[c.rank]).sort((a, b) => b - a);
  const flush = new Set(cards.map((c) => c.suit)).size === 1;
  const cnt   = {};
  vals.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
  const freq  = Object.entries(cnt).sort((a, b) => b[1] - a[1] || +b[0] - +a[0]);
  const byFreq = freq.map(([v]) => +v);
  const str   = new Set(vals).size === 5 && vals[0] - vals[4] === 4;
  const lowStr = vals.join(',') === '14,5,4,3,2';
  const sh    = lowStr ? 5 : vals[0];

  if (flush && str)    return [sh === 14 ? 9 : 8, sh];
  if (flush && lowStr) return [8, 5];
  if (freq[0][1] === 4) return [7, ...byFreq];
  if (freq[0][1] === 3 && freq[1][1] === 2) return [6, ...byFreq];
  if (flush)  return [5, ...vals];
  if (str)    return [4, vals[0]];
  if (lowStr) return [4, 5];
  if (freq[0][1] === 3) return [3, ...byFreq, ...vals];
  if (freq[0][1] === 2 && freq[1][1] === 2) return [2, ...byFreq, ...vals];
  if (freq[0][1] === 2) return [1, ...byFreq, ...vals];
  return [0, ...vals];
}

function cmpScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function bestHand(cards) {
  let best = null, bestScore = null;
  for (const c of combinations(cards, 5)) {
    const s = evalFive(c);
    if (!bestScore || cmpScore(s, bestScore) > 0) { best = c; bestScore = s; }
  }
  return { cards: best, score: bestScore, name: HAND_NAMES[bestScore[0]] };
}

/* ── Session ── */
function createSession(hostId, hostName, bet) {
  return {
    phase: 'lobby',
    players: [createPlayer(hostId, hostName, bet)],
    deck: null, community: [], pot: 0, message: null,
  };
}

function createPlayer(userId, username, bet) {
  return { userId, username, bet, hand: [], result: null, payout: 0 };
}

/* ── Embeds ── */
function buildLobbyEmbed(session) {
  const rows = session.players.map((p) => `\uD83D\uDCB0 <@${p.userId}> \u2014 **${p.bet.toLocaleString('de-DE')} Jetons**`).join('\n');
  return new EmbedBuilder()
    .setTitle('\uD83C\uDCCF Poker \u2013 Lobby')
    .setDescription(`${rows}\n\n_Bis zu ${MAX_PLAYERS} Spieler k\xF6nnen beitreten. Gastgeber startet das Spiel._`)
    .setColor(LIGHT_BLUE)
    .setFooter({ text: `${session.players.length}/${MAX_PLAYERS} Spieler \u2022 ${BRAND}` })
    .setTimestamp();
}

function buildGameEmbed(session) {
  const totalCom = session.community.length;
  const comStr = totalCom === 0
    ? '\uD83C\uDCCF \uD83C\uDCCF \uD83C\uDCCF \uD83C\uDCCF \uD83C\uDCCF'
    : fmtH(session.community) + (totalCom < 5 ? (' \uD83C\uDCCF '.repeat(5 - totalCom)).trimEnd() : '');

  const phaseLabels = { pre: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River' };
  const phaseLabel  = phaseLabels[session.phase] ?? session.phase;

  const playerRows = session.players.map((p) => `\uD83C\uDCCF **${p.username}**: \uD83C\uDCCF \uD83C\uDCCF \u2014 Einsatz: **${p.bet.toLocaleString('de-DE')} Jetons**`).join('\n');
  const pot = session.players.reduce((s, p) => s + p.bet, 0);

  return new EmbedBuilder()
    .setTitle(`\uD83C\uDCCF Poker \u2013 ${phaseLabel}`)
    .addFields(
      { name: '\uD83C\uDFD7\uFE0F Community Cards', value: comStr, inline: false },
      { name: '\uD83D\uDC65 Spieler', value: playerRows, inline: false },
      { name: '\uD83D\uDCB0 Pot', value: `**${pot.toLocaleString('de-DE')} Jetons**`, inline: true },
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND })
    .setTimestamp();
}

function buildShowdownEmbed(session) {
  const pot = session.players.reduce((s, p) => s + p.bet, 0);
  const comStr = fmtH(session.community);

  const embed = new EmbedBuilder()
    .setTitle('\uD83C\uDCCF Poker \u2013 Showdown!')
    .addFields({ name: '\uD83C\uDFD7\uFE0F Community Cards', value: comStr })
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND })
    .setTimestamp();

  for (const p of session.players) {
    const all7 = [...p.hand, ...session.community];
    const bh   = bestHand(all7);
    const won  = p.payout > 0;
    embed.addFields({
      name: `${won ? '\uD83C\uDF89' : '\uD83D\uDCB8'} ${p.username}`,
      value: `Karten: **${fmtH(p.hand)}**\nBeste Hand: **${bh.name}**\n${won ? `**+${(p.payout - p.bet).toLocaleString('de-DE')} Jetons**` : `**-${p.bet.toLocaleString('de-DE')} Jetons**`}`,
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

function gameButtons(hostId, phase) {
  const labels = { pre: '\uD83C\uDCCF Flop anzeigen', flop: '\uD83C\uDCCF Turn anzeigen', turn: '\uD83C\uDCCF River anzeigen', river: '\uD83C\uDFC6 Showdown!' };
  const actions = { pre: 'flop', flop: 'turn', turn: 'river', river: 'showdown' };
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pk|${actions[phase]}|${hostId}`).setLabel(labels[phase]).setStyle(ButtonStyle.Primary),
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
  const modal = new ModalBuilder().setCustomId(`pk|modal|${userId}`).setTitle('\uD83C\uDCCF Poker \u2013 Einsatz');
  const input = new TextInputBuilder().setCustomId('bet_amount').setLabel('Einsatz (z.B. 5000 oder 5K)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('5000');
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

function buildJoinModal(hostId) {
  const modal = new ModalBuilder().setCustomId(`pk|joinmodal|${hostId}`).setTitle('\uD83C\uDCCF Poker \u2013 Einsatz');
  const input = new TextInputBuilder().setCustomId('bet_amount').setLabel('Einsatz (z.B. 5000 oder 5K)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('5000');
  return modal.addComponents(new ActionRowBuilder().addComponents(input));
}

module.exports = {
  MAX_PLAYERS, createDeck, bestHand, cmpScore, HAND_NAMES,
  createSession, createPlayer, buildLobbyEmbed, buildGameEmbed, buildShowdownEmbed,
  lobbyButtons, gameButtons, endRow, buildModal, buildJoinModal,
};
