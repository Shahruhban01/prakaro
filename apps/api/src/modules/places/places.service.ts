import { GooglePlacesClient } from '../../integrations/google-places/google-places.client';
import {
  DestinationSuggestion,
  ResolvedDestination,
} from '../../integrations/google-places/google-places.types';

export class PlacesService {
  constructor(private readonly googlePlacesClient: GooglePlacesClient) {}

  public async getAutocompleteSuggestions(
    input: string,
    sessionToken?: string,
    callerSignal?: AbortSignal,
  ): Promise<{ data: DestinationSuggestion[] }> {
    const list = await this.googlePlacesClient.autocomplete(
      { input, sessionToken },
      callerSignal,
    );
    return { data: list };
  }

  public async resolveDestination(
    placeId: string,
    sessionToken?: string,
    callerSignal?: AbortSignal,
  ): Promise<{ data: ResolvedDestination | null }> {
    const resolved = await this.googlePlacesClient.resolveDestination(
      { placeId, sessionToken },
      callerSignal,
    );
    return { data: resolved };
  }
}
