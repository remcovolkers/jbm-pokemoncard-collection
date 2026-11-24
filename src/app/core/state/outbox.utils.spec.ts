import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../adapters/demo-data';
import { PendingMutation } from '../domain/models';
import {
  coalesceOutboxMutation,
  computeMinTempRowCounter,
  remapTempRowInQueue,
  remapTempRowInSnapshot,
} from './outbox.utils';

function makeMutation(
  id: string,
  action: PendingMutation['action'],
  payload: Record<string, unknown>,
  tempRowIndex?: number
): PendingMutation {
  return {
    id,
    action,
    payload,
    description: `${action} ${id}`,
    createdAt: `2026-11-24T12:00:0${id.length}Z`,
    ...(tempRowIndex !== undefined ? { tempRowIndex } : {}),
  };
}

describe('outbox.utils (Coalescing, Lock Protection & Temp-Row Remapping)', () => {
  it('voegt updateCard samen met een nog niet verzonden addCard op dezelfde tempRowIndex', () => {
    const add = makeMutation('m1', 'addCard', { cardId: 'sv03-125', name: 'Charizard ex', quantity: 1 }, -1);
    const upd = makeMutation('m2', 'updateCard', { rowIndex: -1, cardId: 'sv03-125', quantity: 3, notes: 'Mint' });

    const out = coalesceOutboxMutation([add], upd, new Set());
    expect(out.length).toBe(1);
    expect(out[0].action).toBe('addCard');
    expect(out[0].tempRowIndex).toBe(-1);
    expect(out[0].payload['quantity']).toBe(3);
    expect(out[0].payload['notes']).toBe('Mint');
    expect(out[0].payload['rowIndex']).toBeUndefined();
  });

  it('annuleert addCard en deleteCard op dezelfde tempRowIndex met 0 netwerkcalls als addCard nog wacht', () => {
    const add = makeMutation('m1', 'addCard', { cardId: 'sv03-125', quantity: 1 }, -1);
    const other = makeMutation('m2', 'logTrade', { cardName: 'Mew' });
    const del = makeMutation('m3', 'deleteCard', { rowIndex: -1, cardId: 'sv03-125' });

    const out = coalesceOutboxMutation([add, other], del, new Set());
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('m2');
  });

  it('wijzigt nooit een in-flight mutatie en voegt nieuwe edits/deletes er netjes achter', () => {
    const add = makeMutation('m1', 'addCard', { cardId: 'sv03-125', quantity: 1 }, -1);
    const inFlight = new Set(['m1']);

    const upd1 = makeMutation('m2', 'updateCard', { rowIndex: -1, cardId: 'sv03-125', quantity: 2 });
    const afterUpd1 = coalesceOutboxMutation([add], upd1, inFlight);
    expect(afterUpd1.length).toBe(2);
    expect(afterUpd1[0].payload['quantity']).toBe(1);

    // Een volgende update mag wel coalescen met de niet-in-flight upd1 (m2)
    const upd2 = makeMutation('m3', 'updateCard', { rowIndex: -1, cardId: 'sv03-125', quantity: 4 });
    const afterUpd2 = coalesceOutboxMutation(afterUpd1, upd2, inFlight);
    expect(afterUpd2.length).toBe(2);
    expect(afterUpd2[1].payload['quantity']).toBe(4);

    // deleteCard terwijl addCard in-flight is verwijdert upd1 en plaatst deleteCard na in-flight add
    const del = makeMutation('m4', 'deleteCard', { rowIndex: -1, cardId: 'sv03-125' });
    const afterDel = coalesceOutboxMutation(afterUpd2, del, inFlight);
    expect(afterDel.length).toBe(2);
    expect(afterDel[0].id).toBe('m1');
    expect(afterDel[1].action).toBe('deleteCard');
  });

  it('bundelt opeenvolgende updateCard, updatePokedexSlot en wishlist-mutaties', () => {
    const u1 = makeMutation('u1', 'updateCard', { rowIndex: 12, cardId: 'sv03.5-151', quantity: 2 });
    const u2 = makeMutation('u2', 'updateCard', { rowIndex: 12, cardId: 'sv03.5-151', quantity: 3, forTrade: true });
    const mergedCards = coalesceOutboxMutation([u1], u2, new Set());
    expect(mergedCards.length).toBe(1);
    expect(mergedCards[0].payload).toMatchObject({ rowIndex: 12, quantity: 3, forTrade: true });

    const d1 = makeMutation('d1', 'updatePokedexSlot', { dexNumber: 25, inBinder: true });
    const d2 = makeMutation('d2', 'updatePokedexSlot', { dexNumber: 25, upgradeWanted: true });
    const mergedDex = coalesceOutboxMutation([d1], d2, new Set());
    expect(mergedDex.length).toBe(1);
    expect(mergedDex[0].payload).toEqual({ dexNumber: 25, inBinder: true, upgradeWanted: true });

    const wAdd = makeMutation('w1', 'addWishlist', { cardName: 'Pikachu', maxBudget: 20 }, -2);
    const wUpd = makeMutation('w2', 'updateWishlist', { rowIndex: -2, originalCardName: 'Pikachu', maxBudget: 30 });
    const mergedWl = coalesceOutboxMutation([wAdd], wUpd, new Set());
    expect(mergedWl.length).toBe(1);
    expect(mergedWl[0].payload['maxBudget']).toBe(30);
    expect(mergedWl[0].payload['originalCardName']).toBeUndefined();

    const wDel = makeMutation('w3', 'deleteWishlist', { rowIndex: -2, cardName: 'Pikachu' });
    const cancelledWl = coalesceOutboxMutation(mergedWl, wDel, new Set());
    expect(cancelledWl.length).toBe(0);
  });

  it('remapt negatieve tempRowIndex naar echte rijnummers in wachtrij en snapshot en berekent minCounter', () => {
    const snap = createDemoSnapshot();
    snap.collection[0] = { ...snap.collection[0], rowIndex: -3 };
    snap.wishlist[0] = { ...snap.wishlist[0], rowIndex: -2 };

    const q = [
      makeMutation('q1', 'updateCard', { rowIndex: -3, quantity: 5 }),
      makeMutation('q2', 'markWishlistFound', { rowIndex: -2, addToCollection: false }),
    ];

    expect(computeMinTempRowCounter(snap, q)).toBe(-3);

    const remappedQ = remapTempRowInQueue(remapTempRowInQueue(q, 'collection', -3, 42), 'wishlist', -2, 18);
    expect(remappedQ[0].payload['rowIndex']).toBe(42);
    expect(remappedQ[1].payload['rowIndex']).toBe(18);

    const remappedSnap = remapTempRowInSnapshot(
      remapTempRowInSnapshot(snap, 'collection', -3, 42),
      'wishlist',
      -2,
      18
    );
    expect(remappedSnap.collection[0].rowIndex).toBe(42);
    expect(remappedSnap.wishlist[0].rowIndex).toBe(18);
  });
});
