import { ScrollRestoreService } from './scroll-restore.service';

describe('ScrollRestoreService', () => {
  let service: ScrollRestoreService;
  beforeEach(() => (service = new ScrollRestoreService()));

  it('herstelt de scrollpositie van Collectie na terugkeren uit Kaartdetail', () => {
    service.onNavigationStart('/collectie', '/collectie/kaart/12', 1840);
    expect(service.resolveScrollTop('/collectie', '/collectie/kaart/12')).toBe(0);
    expect(service.resolveScrollTop('/collectie/kaart/12', '/collectie')).toBe(1840);
  });

  it('behoudt de oorspronkelijke positie bij bladeren tussen kaarten (detail -> detail)', () => {
    service.onNavigationStart('/collectie', '/collectie/kaart/1', 900);
    service.resolveScrollTop('/collectie', '/collectie/kaart/1');
    service.onNavigationStart('/collectie/kaart/1', '/collectie/kaart/2', 0);
    service.resolveScrollTop('/collectie/kaart/1', '/collectie/kaart/2');
    expect(service.resolveScrollTop('/collectie/kaart/2', '/collectie')).toBe(900);
  });

  it('werkt ook vanaf Ruil & Verkoop en Dashboard', () => {
    service.onNavigationStart('/meer/ruil-verkoop', '/collectie/kaart/5', 500);
    expect(service.resolveScrollTop('/collectie/kaart/5', '/meer/ruil-verkoop')).toBe(500);
    service.onNavigationStart('/dashboard', '/collectie/kaart/5', 320);
    expect(service.resolveScrollTop('/collectie/kaart/5', '/dashboard')).toBe(320);
  });

  it('opent een ander hoofdtabblad of een gewone navigatie altijd bovenaan', () => {
    service.onNavigationStart('/collectie', '/collectie/kaart/12', 1840);
    expect(service.resolveScrollTop('/collectie/kaart/12', '/pokedex')).toBe(0);
    expect(service.resolveScrollTop('/pokedex', '/collectie')).toBe(0);
  });

  it('negeert query-parameters bij het herkennen van de terug-route', () => {
    service.onNavigationStart('/collectie?x=1', '/collectie/kaart/3', 700);
    expect(service.resolveScrollTop('/collectie/kaart/3', '/collectie')).toBe(700);
  });
});
