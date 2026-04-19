const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const SPIN_ICON  = '\uD83C\uDF00';
const LIGHT_BLUE = 0x00BFFF;
const BRAND      = 'The Diamond Casino Richman';

const BASE_SYMBOLS = [
  { emoji: '\uD83C\uDF52', name: 'Kirsche',   mult: 2  },
  { emoji: '\uD83C\uDF4B', name: 'Zitrone',   mult: 3  },
  { emoji: '\uD83C\uDF4A', name: 'Orange',    mult: 4  },
  { emoji: '\uD83D\uDD14', name: 'Glocke',    mult: 5  },
  { emoji: '\u2B50',       name: 'Stern',     mult: 10 },
  { emoji: '\uD83D\uDC8E', name: 'Diamant',   mult: 25 },
  { emoji: '7\uFE0F\u20E3',name: 'Sieben',    mult: 50 },
];

const TIERS = [
  {
    label:   '\u2B1C Normales Gl\xFCck',
    min:     1000,
    max:     9999,
    weights: [30, 25, 20, 15,  7,  2,  1],
  },
  {
    label:   '\uD83D\uDFE2 Erh\xF6htes Gl\xFCck',
    min:     10000,
    max:     15000,
    weights: [26, 21, 17, 15, 11,  6,  4],
  },
];

function getTier(bet) {
  return TIERS.find((t) => bet >= t.min && bet <= t.max) ?? TIERS[0];
}

function weightedPick(weights) {
  const total = weights.reduce((a, w) => a + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < BASE_SYMBOLS.length; i++) {
    r -= weights[i];
    if (r <= 0) return BASE_SYMBOLS[i];
  }
  return BASE_SYMBOLS[0];
}

function spin(bet) {
  const { weights } = getTier(bet);
  return [weightedPick(weights), weightedPick(weights), weightedPick(weights)];
}

function calcWin(reels, bet) {
  const [a, b, c] = reels;
  if (a.emoji === b.emoji && b.emoji === c.emoji)
    return { type: 'jackpot', symbol: a, win: bet * a.mult, mult: a.mult };
  if (a.emoji === b.emoji || b.emoji === c.emoji || a.emoji === c.emoji)
    return { type: 'pair', win: Math.floor(bet * 1.5), mult: 1.5 };
  return { type: 'lose', win: 0, mult: 0 };
}

function parseBet(raw) {
  let s = raw.trim().toUpperCase().replace(/\s/g, '');
  if (s.endsWith('K')) {
    const num = parseFloat(s.slice(0, -1).replace(',', '.'));
    if (isNaN(num)) return NaN;
    return Math.floor(num * 1000);
  }
  s = s.replace(/[.,]/g, '');
  return parseInt(s, 10);
}

const LINE = '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';

function reelRow(reels, frame) {
  const r = (i) => frame > i ? reels[i].emoji : SPIN_ICON;
  return `\u2003${r(0)}\u3000\u2502\u3000${r(1)}\u3000\u2502\u3000${r(2)}`;
}

function machineSection(reels, frame) {
  return LINE + '\n' + reelRow(reels, frame) + '\n' + LINE;
}

const SPIN_STATUS = [
  '\uD83C\uDF00 **Alle Rollen drehen sich...**',
  '\uD83D\uDFE2 Erste Rolle gestoppt!\n\uD83C\uDF00 **Noch am Drehen...**',
  '\uD83D\uDFE2 \uD83D\uDFE2 Zweite Rolle gestoppt!\n\uD83C\uDF00 **Letzte Rolle dreht...**',
];

function buildModal(userId) {
  const modal = new ModalBuilder()
    .setCustomId(`sm|modal|${userId}`)
    .setTitle('\uD83C\uDFB0 Einsatz w\xE4hlen');
  const input = new TextInputBuilder()
    .setCustomId('bet_amount')
    .setLabel('Einsatz (1.000 \u2013 250.000 Jetons)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('z.B. 5000 oder 50K')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(7);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildSpinEmbed(reels, bet, balance, frame) {
  const tier = getTier(bet);
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB0  ' + BRAND)
    .setDescription(
      machineSection(reels, frame) + '\n\n' +
      SPIN_STATUS[frame] + '\n\n' +
      `\uD83D\uDCB0 **Einsatz:** ${bet.toLocaleString('de-DE')} Jetons\n` +
      `\uD83C\uDFE6 **Guthaben:** ${balance.toLocaleString('de-DE')} Jetons\n` +
      `\uD83C\uDFB2 **Gl\xFCcks-Tier:** ${tier.label}`
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND + ' \u2022 Viel Gl\xFCck!' });
}

function buildResultEmbed(reels, bet, result, finalBalance) {
  const tier = getTier(bet);
  let resultText;
  if (result.type === 'jackpot') {
    resultText =
      `\uD83C\uDF89 **JACKPOT! 3x ${result.symbol.name}!**\n` +
      `Multiplikator: **x${result.mult}**\n` +
      `\uD83D\uDCB8 Gewinn: **+${result.win.toLocaleString('de-DE')} Jetons**`;
  } else if (result.type === 'pair') {
    resultText =
      `\uD83D\uDCB0 **Zwei Gleiche! Kleiner Gewinn!**\n` +
      `\uD83D\uDCB8 Gewinn: **+${result.win.toLocaleString('de-DE')} Jetons**`;
  } else {
    resultText =
      `\uD83D\uDC94 **Leider nichts diesmal...**\n` +
      `Verlust: **-${bet.toLocaleString('de-DE')} Jetons**`;
  }
  return new EmbedBuilder()
    .setTitle('\uD83C\uDFB0  ' + BRAND + '  \u2013  Ergebnis')
    .setDescription(
      machineSection(reels, 3) + '\n\n' +
      resultText + '\n\n' +
      `\uD83C\uDFE6 **Neues Guthaben:** ${finalBalance.toLocaleString('de-DE')} Jetons\n` +
      `\uD83C\uDFB2 **Gl\xFCcks-Tier:** ${tier.label}`
    )
    .setColor(LIGHT_BLUE)
    .setFooter({ text: BRAND + ' \u2022 Weiterspielen?' });
}

function gameRows(bet, balance, userId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sm|continue|${userId}`)
      .setLabel(`\uD83D\uDD04 Weiterspielen (${bet.toLocaleString('de-DE')} Jetons)`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(balance < bet),
    new ButtonBuilder()
      .setCustomId(`sm|changebeta|${userId}`)
      .setLabel('\uD83D\uDCB0 Einsatz \xE4ndern')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`sm|quit|${userId}`)
      .setLabel('\u274C Beenden')
      .setStyle(ButtonStyle.Danger),
  )];
}

module.exports = { spin, calcWin, parseBet, buildModal, buildSpinEmbed, buildResultEmbed, gameRows };
