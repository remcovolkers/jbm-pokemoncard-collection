import { Injectable, inject } from '@angular/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PlatformService } from './platform.service';

/**
 * Tactiele feedback voor mobiele interacties via Capacitor Haptics (native)
 * met subtiele navigator.vibrate fallback op mobiele browsers.
 */
@Injectable({ providedIn: 'root' })
export class HapticsService {
  private readonly platform = inject(PlatformService);

  async light(): Promise<void> {
    if (this.platform.isNative()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
        return;
      } catch {
        // Negeer als plugin niet beschikbaar is
      }
    }
    this.vibrateWeb(8);
  }

  async medium(): Promise<void> {
    if (this.platform.isNative()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Medium });
        return;
      } catch {
        // Negeer
      }
    }
    this.vibrateWeb(14);
  }

  async success(): Promise<void> {
    if (this.platform.isNative()) {
      try {
        await Haptics.notification({ type: NotificationType.Success });
        return;
      } catch {
        // Negeer
      }
    }
    this.vibrateWeb([10, 30, 14]);
  }

  async warning(): Promise<void> {
    if (this.platform.isNative()) {
      try {
        await Haptics.notification({ type: NotificationType.Warning });
        return;
      } catch {
        // Negeer
      }
    }
    this.vibrateWeb([14, 24, 14]);
  }

  private vibrateWeb(pattern: number | number[]): void {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Negeer in headless/test-omgevingen
    }
  }
}
