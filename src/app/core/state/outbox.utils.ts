import { AppSnapshot, PendingMutation } from '../domain/models';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameCollectionCardTarget(
  payload: Record<string, unknown>,
  rowIndex: unknown,
  cardId: unknown
): boolean {
  if (!isFiniteNumber(rowIndex) || payload['rowIndex'] !== rowIndex) {
    return false;
  }
  if (rowIndex < 0) {
    return true;
  }
  const leftId = String(payload['cardId'] ?? '').trim();
  const rightId = String(cardId ?? '').trim();
  return !leftId || !rightId || leftId === rightId;
}

function sameWishlistRowTarget(payload: Record<string, unknown>, rowIndex: unknown): boolean {
  return isFiniteNumber(rowIndex) && payload['rowIndex'] === rowIndex;
}

function findTrailingUnlockedIndex(
  queue: readonly PendingMutation[],
  inFlightIds: ReadonlySet<string>,
  predicate: (item: PendingMutation) => boolean,
  stopAtInFlight: (item: PendingMutation) => boolean
): number {
  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    if (inFlightIds.has(item.id)) {
      if (stopAtInFlight(item)) {
        return -1;
      }
      continue;
    }
    if (predicate(item)) {
      return i;
    }
  }
  return -1;
}

/**
 * Voegt een nieuwe mutatie samen met wachtende (nog niet in-flight) outbox-items
 * om dubbele netwerk-calls te voorkomen en lokale snelle bewerkingen netjes te bundelen.
 */
export function coalesceOutboxMutation(
  queue: readonly PendingMutation[],
  incoming: PendingMutation,
  inFlightIds: ReadonlySet<string>
): PendingMutation[] {
  const next = [...queue];

  if (incoming.action === 'updateCard') {
    const targetRow = incoming.payload['rowIndex'];
    const targetCardId = incoming.payload['cardId'];
    const idx = findTrailingUnlockedIndex(
      next,
      inFlightIds,
      (item) =>
        (item.action === 'addCard' &&
          isFiniteNumber(targetRow) &&
          targetRow < 0 &&
          item.tempRowIndex === targetRow) ||
        (item.action === 'updateCard' &&
          sameCollectionCardTarget(item.payload, targetRow, targetCardId)),
      (item) =>
        (item.action === 'addCard' &&
          isFiniteNumber(targetRow) &&
          targetRow < 0 &&
          item.tempRowIndex === targetRow) ||
        ((item.action === 'updateCard' || item.action === 'deleteCard') &&
          sameCollectionCardTarget(item.payload, targetRow, targetCardId))
    );

    if (idx !== -1) {
      const existing = next[idx];
      if (existing.action === 'addCard') {
        const { rowIndex: _ignoredRow, ...patchFields } = incoming.payload;
        next[idx] = {
          ...existing,
          payload: { ...existing.payload, ...patchFields },
          description: incoming.description || existing.description,
        };
        return next;
      }
      next[idx] = {
        ...existing,
        payload: { ...existing.payload, ...incoming.payload },
        createdAt: incoming.createdAt,
        description: incoming.description || existing.description,
      };
      return next;
    }
    return [...next, incoming];
  }

  if (incoming.action === 'deleteCard') {
    const targetRow = incoming.payload['rowIndex'];
    const targetCardId = incoming.payload['cardId'];
    const isTempTarget = isFiniteNumber(targetRow) && targetRow < 0;

    if (isTempTarget) {
      const inFlightAdd = next.some(
        (item) =>
          inFlightIds.has(item.id) &&
          item.action === 'addCard' &&
          item.tempRowIndex === targetRow
      );
      if (!inFlightAdd) {
        const unlockedAddIdx = next.findIndex(
          (item) =>
            !inFlightIds.has(item.id) &&
            item.action === 'addCard' &&
            item.tempRowIndex === targetRow
        );
        if (unlockedAddIdx !== -1) {
          return next.filter(
            (item) =>
              inFlightIds.has(item.id) ||
              !(
                (item.action === 'addCard' && item.tempRowIndex === targetRow) ||
                ((item.action === 'updateCard' || item.action === 'deleteCard') &&
                  item.payload['rowIndex'] === targetRow)
              )
          );
        }
      }
    }

    const lastLockedIdx = (() => {
      for (let i = next.length - 1; i >= 0; i--) {
        const item = next[i];
        if (!inFlightIds.has(item.id)) continue;
        if (
          (item.action === 'addCard' && isTempTarget && item.tempRowIndex === targetRow) ||
          sameCollectionCardTarget(item.payload, targetRow, targetCardId)
        ) {
          return i;
        }
      }
      return -1;
    })();

    const pruned = next.filter((item, index) => {
      if (index <= lastLockedIdx || inFlightIds.has(item.id)) return true;
      return !(
        item.action === 'updateCard' &&
        sameCollectionCardTarget(item.payload, targetRow, targetCardId)
      );
    });
    return [...pruned, incoming];
  }

  if (incoming.action === 'updatePokedexSlot') {
    const dexNumber = incoming.payload['dexNumber'];
    if (isFiniteNumber(dexNumber)) {
      const idx = findTrailingUnlockedIndex(
        next,
        inFlightIds,
        (item) => item.action === 'updatePokedexSlot' && item.payload['dexNumber'] === dexNumber,
        (item) => item.action === 'updatePokedexSlot' && item.payload['dexNumber'] === dexNumber
      );
      if (idx !== -1) {
        const existing = next[idx];
        next[idx] = {
          ...existing,
          payload: { ...existing.payload, ...incoming.payload },
          createdAt: incoming.createdAt,
          description: incoming.description || existing.description,
        };
        return next;
      }
    }
    return [...next, incoming];
  }

  if (incoming.action === 'updateWishlist') {
    const targetRow = incoming.payload['rowIndex'];
    const idx = findTrailingUnlockedIndex(
      next,
      inFlightIds,
      (item) =>
        (item.action === 'addWishlist' &&
          isFiniteNumber(targetRow) &&
          targetRow < 0 &&
          item.tempRowIndex === targetRow) ||
        (item.action === 'updateWishlist' && sameWishlistRowTarget(item.payload, targetRow)),
      (item) =>
        (item.action === 'addWishlist' &&
          isFiniteNumber(targetRow) &&
          targetRow < 0 &&
          item.tempRowIndex === targetRow) ||
        ((item.action === 'updateWishlist' || item.action === 'deleteWishlist') &&
          sameWishlistRowTarget(item.payload, targetRow))
    );

    if (idx !== -1) {
      const existing = next[idx];
      if (existing.action === 'addWishlist') {
        const {
          rowIndex: _ignoredRow,
          originalCardName: _ignoredOrig,
          ...patchFields
        } = incoming.payload;
        next[idx] = {
          ...existing,
          payload: { ...existing.payload, ...patchFields },
          description: incoming.description || existing.description,
        };
        return next;
      }
      const preservedOrig =
        existing.payload['originalCardName'] ?? incoming.payload['originalCardName'];
      next[idx] = {
        ...existing,
        payload: {
          ...existing.payload,
          ...incoming.payload,
          ...(preservedOrig !== undefined ? { originalCardName: preservedOrig } : {}),
        },
        createdAt: incoming.createdAt,
        description: incoming.description || existing.description,
      };
      return next;
    }
    return [...next, incoming];
  }

  if (incoming.action === 'deleteWishlist') {
    const targetRow = incoming.payload['rowIndex'];
    const isTempTarget = isFiniteNumber(targetRow) && targetRow < 0;

    if (isTempTarget) {
      const inFlightAdd = next.some(
        (item) =>
          inFlightIds.has(item.id) &&
          item.action === 'addWishlist' &&
          item.tempRowIndex === targetRow
      );
      if (!inFlightAdd) {
        const unlockedAddIdx = next.findIndex(
          (item) =>
            !inFlightIds.has(item.id) &&
            item.action === 'addWishlist' &&
            item.tempRowIndex === targetRow
        );
        if (unlockedAddIdx !== -1) {
          return next.filter(
            (item) =>
              inFlightIds.has(item.id) ||
              !(
                (item.action === 'addWishlist' && item.tempRowIndex === targetRow) ||
                ((item.action === 'updateWishlist' ||
                  item.action === 'markWishlistFound' ||
                  item.action === 'deleteWishlist') &&
                  item.payload['rowIndex'] === targetRow)
              )
          );
        }
      }
    }

    const lastLockedIdx = (() => {
      for (let i = next.length - 1; i >= 0; i--) {
        const item = next[i];
        if (!inFlightIds.has(item.id)) continue;
        if (
          (item.action === 'addWishlist' && isTempTarget && item.tempRowIndex === targetRow) ||
          sameWishlistRowTarget(item.payload, targetRow)
        ) {
          return i;
        }
      }
      return -1;
    })();

    const pruned = next.filter((item, index) => {
      if (index <= lastLockedIdx || inFlightIds.has(item.id)) return true;
      return !(item.action === 'updateWishlist' && sameWishlistRowTarget(item.payload, targetRow));
    });
    return [...pruned, incoming];
  }

  return [...next, incoming];
}

/**
 * Vervangt een tijdelijk negatief rijnummer door het door Google Sheets toegewezen rijnummer
 * in resterende wachtrij-mutaties.
 */
export function remapTempRowInQueue(
  queue: readonly PendingMutation[],
  entity: 'collection' | 'wishlist',
  tempRowIndex: number,
  realRowIndex: number
): PendingMutation[] {
  if (!isFiniteNumber(tempRowIndex) || tempRowIndex >= 0 || !isFiniteNumber(realRowIndex) || realRowIndex < 2) {
    return [...queue];
  }

  let changed = false;
  const mapped = queue.map((item) => {
    const isCollectionMatch =
      entity === 'collection' &&
      (item.action === 'updateCard' || item.action === 'deleteCard') &&
      item.payload['rowIndex'] === tempRowIndex;
    const isWishlistMatch =
      entity === 'wishlist' &&
      (item.action === 'updateWishlist' ||
        item.action === 'deleteWishlist' ||
        item.action === 'markWishlistFound') &&
      item.payload['rowIndex'] === tempRowIndex;

    if (!isCollectionMatch && !isWishlistMatch) {
      return item;
    }

    changed = true;
    return {
      ...item,
      payload: {
        ...item.payload,
        rowIndex: realRowIndex,
      },
    };
  });

  return changed ? mapped : [...queue];
}

/**
 * Vervangt een tijdelijk negatief rijnummer door het bevestigde rijnummer in een lokaal snapshot.
 */
export function remapTempRowInSnapshot(
  snap: AppSnapshot,
  entity: 'collection' | 'wishlist' | 'trades',
  tempRowIndex: number,
  realRowIndex: number
): AppSnapshot {
  if (!isFiniteNumber(tempRowIndex) || tempRowIndex >= 0 || !isFiniteNumber(realRowIndex) || realRowIndex < 2) {
    return snap;
  }

  if (entity === 'collection') {
    let changed = false;
    const collection = snap.collection.map((c) => {
      if (c.rowIndex !== tempRowIndex) return c;
      changed = true;
      return { ...c, rowIndex: realRowIndex };
    });
    return changed ? { ...snap, collection } : snap;
  }

  if (entity === 'wishlist') {
    let changed = false;
    const wishlist = snap.wishlist.map((w) => {
      if (w.rowIndex !== tempRowIndex) return w;
      changed = true;
      return { ...w, rowIndex: realRowIndex };
    });
    return changed ? { ...snap, wishlist } : snap;
  }

  let changed = false;
  const trades = snap.trades.map((t) => {
    if (t.rowIndex !== tempRowIndex) return t;
    changed = true;
    return { ...t, rowIndex: realRowIndex };
  });
  return changed ? { ...snap, trades } : snap;
}

/**
 * Bepaalt het laagste tijdelijke rijnummer in persistente snapshot en wachtrij zodat na herstart
 * nooit botsende tijdelijke rij-ID's worden uitgedeeld.
 */
export function computeMinTempRowCounter(
  snap: AppSnapshot,
  queue: readonly PendingMutation[]
): number {
  let minVal = 0;
  for (const c of snap.collection) {
    if (c.rowIndex < minVal) minVal = c.rowIndex;
  }
  for (const w of snap.wishlist) {
    if (w.rowIndex < minVal) minVal = w.rowIndex;
  }
  for (const t of snap.trades) {
    if (t.rowIndex < minVal) minVal = t.rowIndex;
  }
  for (const q of queue) {
    if (isFiniteNumber(q.tempRowIndex) && q.tempRowIndex < minVal) {
      minVal = q.tempRowIndex;
    }
    const payloadRow = q.payload['rowIndex'];
    if (isFiniteNumber(payloadRow) && payloadRow < minVal) {
      minVal = payloadRow;
    }
  }
  return minVal;
}
