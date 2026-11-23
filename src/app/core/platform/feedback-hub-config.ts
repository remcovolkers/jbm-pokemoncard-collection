import { InjectionToken } from '@angular/core';

export interface FeedbackHubEndpointConfig {
  endpointUrl: string;
  appKey: string;
}

/**
 * Centrale PokéBinder Feedback Hub Web App endpoint (gekoppeld aan één losstaande
 * Feedback-spreadsheet + Google Drive screenshotmap, volledig onafhankelijk van
 * gebruikers-collectiesheets, Test-profielen of Demo-modus).
 */
export const FEEDBACK_HUB_CONFIG: FeedbackHubEndpointConfig = {
  endpointUrl:
    'https://script.google.com/macros/s/AKfycbwMhgPDYbT12WVGIhlMMMwPoM9PTPBWOrNs9oYJcDZ5TXOXWDP1jLQPvfuhADz1Zo54eg/exec',
  appKey: 'pokebinder-feedback-v1',
};

export const FEEDBACK_HUB_ENDPOINT = new InjectionToken<FeedbackHubEndpointConfig>(
  'FEEDBACK_HUB_ENDPOINT',
  {
    providedIn: 'root',
    factory: () => FEEDBACK_HUB_CONFIG,
  }
);
