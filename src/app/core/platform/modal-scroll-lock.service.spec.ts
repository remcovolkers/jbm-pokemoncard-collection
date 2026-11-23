import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModalScrollLockService } from './modal-scroll-lock.service';

describe('ModalScrollLockService', () => {
  let service: ModalScrollLockService;

  beforeEach(() => {
    document.documentElement.classList.remove('pb-modal-open');
    document.body.classList.remove('pb-modal-open');
    document.documentElement.style.removeProperty('--pb-scrollbar-comp');
    TestBed.configureTestingModule({});
    service = TestBed.inject(ModalScrollLockService);
  });

  afterEach(() => {
    document.documentElement.classList.remove('pb-modal-open');
    document.body.classList.remove('pb-modal-open');
    document.documentElement.style.removeProperty('--pb-scrollbar-comp');
  });

  it('voegt pb-modal-open toe bij lock en verwijdert deze bij unlock', () => {
    expect(service.isLocked()).toBe(false);
    expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);

    const release = service.lock();
    expect(service.isLocked()).toBe(true);
    expect(document.documentElement.classList.contains('pb-modal-open')).toBe(true);
    expect(document.body.classList.contains('pb-modal-open')).toBe(true);

    release();
    expect(service.isLocked()).toBe(false);
    expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);
    expect(document.body.classList.contains('pb-modal-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--pb-scrollbar-comp')).toBe('');
  });

  it('ondersteunt gestapelde locks en idempotente release-aanroepen', () => {
    const releaseFirst = service.lock();
    const releaseSecond = service.lock();

    expect(service.isLocked()).toBe(true);
    expect(document.documentElement.classList.contains('pb-modal-open')).toBe(true);

    // Dubbele release op eerste lock mag tweede actieve lock niet voortijdig opheffen
    releaseFirst();
    releaseFirst();
    expect(service.isLocked()).toBe(true);
    expect(document.documentElement.classList.contains('pb-modal-open')).toBe(true);

    releaseSecond();
    expect(service.isLocked()).toBe(false);
    expect(document.documentElement.classList.contains('pb-modal-open')).toBe(false);
    expect(document.body.classList.contains('pb-modal-open')).toBe(false);
  });
});
