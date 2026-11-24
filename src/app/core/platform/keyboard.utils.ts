/**
 * Retourneert true wanneer een keyboard-event afkomstig is uit een bewerkbaar invoerveld,
 * zodat globale sneltoetsen (zoals / of pijltjestoetsen) het typen nooit verstoren.
 */
export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}
