import {
  BinderSlotsPerPage,
  CardFinancialMetrics,
  CollectionCard,
  PortfolioSummary,
  TradeEntry,
  WishlistItem,
} from './models';

export interface BinderPosition {
  page: number;
  slotInPage: number;
  row: number;
  column: number;
  columnsPerPage: number;
  rowsPerPage: number;
  label: string;
}

/**
 * Berekent waarde, aankoopkosten, winst/verlies en ROI% voor één collectieregel.
 */
export function calculateCardMetrics(card: Pick<CollectionCard, 'quantity' | 'purchasePrice' | 'marketPrice'>): CardFinancialMetrics {
  const qty = Math.max(0, Number(card.quantity) || 0);
  const buy = Number(card.purchasePrice) || 0;
  const market = Number(card.marketPrice) || 0;

  const totalCost = roundCurrency(buy * qty);
  const totalValue = roundCurrency(market * qty);
  const profitLoss = roundCurrency(totalValue - totalCost);
  const roiPercent = totalCost > 0 ? roundOneDecimal((profitLoss / totalCost) * 100) : 0;

  return { totalValue, totalCost, profitLoss, roiPercent };
}

/**
 * Aggregeert live portfolio KPI's voor het Dashboard.
 */
export function calculatePortfolioSummary(
  collection: CollectionCard[],
  wishlist: WishlistItem[],
  trades: TradeEntry[]
): PortfolioSummary {
  let uniqueCards = 0;
  let totalCopies = 0;
  let purchaseValue = 0;
  let marketValue = 0;
  let tradeValue = 0;
  let tradeCount = 0;

  for (const card of collection) {
    uniqueCards += 1;
    const qty = Math.max(0, card.quantity || 0);
    totalCopies += qty;
    purchaseValue += (card.purchasePrice || 0) * qty;
    marketValue += (card.marketPrice || 0) * qty;

    if (card.forTrade || qty > 1) {
      const tradableQty = card.forTrade ? qty : Math.max(0, qty - 1);
      tradeCount += tradableQty;
      tradeValue += (card.marketPrice || 0) * tradableQty;
    }
  }

  purchaseValue = roundCurrency(purchaseValue);
  marketValue = roundCurrency(marketValue);
  const unrealizedProfit = roundCurrency(marketValue - purchaseValue);
  const roiPercent = purchaseValue > 0 ? roundOneDecimal((unrealizedProfit / purchaseValue) * 100) : 0;

  const realizedProfit = roundCurrency(
    trades.reduce((acc, t) => acc + (Number.isFinite(t.netResult) ? t.netResult : t.saleValue - t.purchasePrice - t.platformFees), 0)
  );

  const openWishlist = wishlist.filter((item) => !item.found);
  const openWishlistBudget = roundCurrency(openWishlist.reduce((acc, w) => acc + (w.maxBudget || 0), 0));
  const openWishlistMarketTotal = roundCurrency(openWishlist.reduce((acc, w) => acc + (w.marketPrice || 0), 0));

  return {
    uniqueCards,
    totalCopies,
    purchaseValue,
    marketValue,
    unrealizedProfit,
    roiPercent,
    realizedProfit,
    openWishlistBudget,
    openWishlistMarketTotal,
    openWishlistCount: openWishlist.length,
    tradeValue: roundCurrency(tradeValue),
    tradeCount,
  };
}

/**
 * Berekent exacte binderpagina, vakje, rij en kolom voor een National Pokédex-nummer (1..1025).
 * Ondersteunt 4 (2×2), 9 (3×3), 12 (4×3) en 16 (4×4) vakjes per pagina.
 */
export function calculateBinderPosition(
  dexNumber: number,
  slotsPerPage: BinderSlotsPerPage
): BinderPosition {
  const safeDex = Math.max(1, Math.floor(dexNumber));
  const page = Math.floor((safeDex - 1) / slotsPerPage) + 1;
  const slotInPage = ((safeDex - 1) % slotsPerPage) + 1;

  const layoutMap: Record<BinderSlotsPerPage, { cols: number; rows: number }> = {
    4: { cols: 2, rows: 2 },
    9: { cols: 3, rows: 3 },
    12: { cols: 4, rows: 3 },
    16: { cols: 4, rows: 4 },
  };
  const { cols, rows } = layoutMap[slotsPerPage];
  const row = Math.floor((slotInPage - 1) / cols) + 1;
  const column = ((slotInPage - 1) % cols) + 1;

  return {
    page,
    slotInPage,
    row,
    column,
    columnsPerPage: cols,
    rowsPerPage: rows,
    label: `P${page} · R${row}K${column}`,
  };
}

export interface ParsedCardNumber {
  prefix: string;
  numeric: number;
  suffix: string;
  denominator: number;
  raw: string;
}

/**
 * Parset kaartnummers zoals "44/102", "166/165", "003/165", "TG05/TG30", "SV049/SV122"
 * zodat numerieke sortering 44/102 altijd vóór 166/165 plaatst.
 */
export function parseCardNumberParts(cardNumber: string): ParsedCardNumber {
  const raw = (cardNumber || '').trim();
  const [left = '', right = ''] = raw.split('/');
  const match = left.trim().match(/^([a-z]*)(\d+)([a-z]*)$/i);
  const denomMatch = right.trim().match(/(\d+)/);

  if (!match) {
    return {
      prefix: left.toUpperCase(),
      numeric: Number.MAX_SAFE_INTEGER,
      suffix: '',
      denominator: denomMatch ? parseInt(denomMatch[1], 10) : 0,
      raw,
    };
  }

  return {
    prefix: (match[1] || '').toUpperCase(),
    numeric: parseInt(match[2], 10),
    suffix: (match[3] || '').toUpperCase(),
    denominator: denomMatch ? parseInt(denomMatch[1], 10) : 0,
    raw,
  };
}

/**
 * Numerieke comparator voor kaartnummers:
 *  - Standaard nummers (zonder letters zoals 44/102, 166/165) komen vóór subset-prefixen (TG01, GG01).
 *  - Binnen dezelfde prefix wordt numeriek gesorteerd (44 vóór 166, 3 vóór 12).
 */
export function compareCardNumbers(a: string, b: string): number {
  const pa = parseCardNumberParts(a);
  const pb = parseCardNumberParts(b);

  if (pa.prefix !== pb.prefix) {
    if (!pa.prefix) return -1;
    if (!pb.prefix) return 1;
    return pa.prefix.localeCompare(pb.prefix, 'nl');
  }

  if (pa.numeric !== pb.numeric) {
    return pa.numeric - pb.numeric;
  }

  if (pa.suffix !== pb.suffix) {
    return pa.suffix.localeCompare(pb.suffix, 'nl');
  }

  if (pa.denominator !== pb.denominator) {
    return pa.denominator - pb.denominator;
  }

  return pa.raw.localeCompare(pb.raw, 'nl');
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

const eurFormatter = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat('nl-NL');

export function formatEur(amount: number, showSign = false): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const absFormatted = eurFormatter.format(Math.abs(safe));
  if (safe < 0) return `-€\u00A0${absFormatted}`;
  if (showSign && safe > 0) return `+€\u00A0${absFormatted}`;
  return `€\u00A0${absFormatted}`;
}

export function formatPercent(percent: number, showSign = true): string {
  const safe = Number.isFinite(percent) ? percent : 0;
  const formatted = Math.abs(safe).toFixed(1).replace('.', ',');
  if (safe < 0) return `-${formatted}%`;
  if (showSign && safe > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

export function formatInteger(value: number): string {
  return intFormatter.format(Math.round(value || 0));
}

export function formatDexNumber(dexNumber: number): string {
  return `#${String(Math.max(1, Math.floor(dexNumber))).padStart(4, '0')}`;
}
