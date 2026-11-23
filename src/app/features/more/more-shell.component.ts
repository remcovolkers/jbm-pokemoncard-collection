import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-more-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="more-shell">
      <router-outlet />
    </div>
  `,
  styles: [
    `
      .more-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
      }
    `,
  ],
})
export class MoreShellComponent {}
