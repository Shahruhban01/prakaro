import { prisma } from '../../common/database/prisma';

export interface SaveParkingInput {
  providerPlaceId: string;
  provider?: string;
}

export interface CreateRecentSearchInput {
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  originType?: string;
  providerPlaceId?: string;
  destinationLabel?: string;
}

export interface UpdatePreferencesInput {
  recentSearchEnabled?: boolean;
  defaultRadiusMeters?: number;
}

export class UserService {
  // --------------------------------------------------------------------------
  // Saved Parking (Cloud Sync)
  // --------------------------------------------------------------------------

  public async getSavedParking(userId: string) {
    const list = await prisma.savedParking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      data: list,
      meta: { count: list.length },
    };
  }

  public async saveParking(userId: string, input: SaveParkingInput) {
    const provider = input.provider || 'google';
    const cleanPlaceId = input.providerPlaceId.replace(/^google:/, '').trim();

    const record = await prisma.savedParking.upsert({
      where: {
        userId_provider_providerPlaceId: {
          userId,
          provider,
          providerPlaceId: cleanPlaceId,
        },
      },
      create: {
        userId,
        provider,
        providerPlaceId: cleanPlaceId,
      },
      update: {
        createdAt: new Date(),
      },
    });

    return { data: record };
  }

  public async deleteSavedParking(userId: string, idOrPlaceId: string) {
    const clean = idOrPlaceId.replace(/^google:/, '').trim();

    await prisma.savedParking.deleteMany({
      where: {
        userId,
        OR: [
          { id: idOrPlaceId },
          { providerPlaceId: clean },
          { providerPlaceId: idOrPlaceId },
        ],
      },
    });

    return { success: true };
  }

  // --------------------------------------------------------------------------
  // Recent Searches & Privacy
  // --------------------------------------------------------------------------

  public async getRecentSearches(userId: string) {
    const pref = await this.getPreferences(userId);
    const isEnabled = pref.data.recentSearchEnabled;

    if (!isEnabled) {
      return {
        data: [],
        meta: {
          count: 0,
          recordingEnabled: false,
        },
      };
    }

    const list = await prisma.recentSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    return {
      data: list,
      meta: {
        count: list.length,
        recordingEnabled: true,
      },
    };
  }

  public async createRecentSearch(userId: string, input: CreateRecentSearchInput) {
    const pref = await this.getPreferences(userId);
    if (!pref.data.recentSearchEnabled) {
      return {
        data: null,
        meta: { recorded: false, reason: 'Search history is disabled in user preferences.' },
      };
    }

    // Deduplicate: if search with same providerPlaceId or near-identical coordinates exists, remove it
    if (input.providerPlaceId) {
      await prisma.recentSearch.deleteMany({
        where: {
          userId,
          providerPlaceId: input.providerPlaceId,
        },
      });
    } else if (input.latitude != null && input.longitude != null) {
      const latMin = input.latitude - 0.005;
      const latMax = input.latitude + 0.005;
      const lngMin = input.longitude - 0.005;
      const lngMax = input.longitude + 0.005;

      await prisma.recentSearch.deleteMany({
        where: {
          userId,
          latitude: { gte: latMin, lte: latMax },
          longitude: { gte: lngMin, lte: lngMax },
        },
      });
    }

    const record = await prisma.recentSearch.create({
      data: {
        userId,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMeters: input.radiusMeters ?? 3000,
        originType: input.originType ?? 'explicitAreaSearch',
        providerPlaceId: input.providerPlaceId,
        destinationLabel: input.destinationLabel,
      },
    });

    // Bound total count to max 15
    const total = await prisma.recentSearch.count({ where: { userId } });
    if (total > 15) {
      const oldest = await prisma.recentSearch.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: total - 15,
        select: { id: true },
      });
      if (oldest.length > 0) {
        await prisma.recentSearch.deleteMany({
          where: { id: { in: oldest.map((o) => o.id) } },
        });
      }
    }

    return { data: record, meta: { recorded: true } };
  }

  public async deleteRecentSearch(userId: string, id: string) {
    await prisma.recentSearch.deleteMany({
      where: { id, userId },
    });
    return { success: true };
  }

  public async clearRecentSearches(userId: string) {
    await prisma.recentSearch.deleteMany({
      where: { userId },
    });
    return { success: true };
  }

  // --------------------------------------------------------------------------
  // User Preferences
  // --------------------------------------------------------------------------

  public async getPreferences(userId: string) {
    const pref = await prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        recentSearchEnabled: false,
        defaultRadiusMeters: 3000,
      },
      update: {},
    });

    return { data: pref };
  }

  public async updatePreferences(userId: string, input: UpdatePreferencesInput) {
    const pref = await prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        recentSearchEnabled: input.recentSearchEnabled ?? false,
        defaultRadiusMeters: input.defaultRadiusMeters ?? 3000,
      },
      update: {
        ...(input.recentSearchEnabled !== undefined
          ? { recentSearchEnabled: input.recentSearchEnabled }
          : {}),
        ...(input.defaultRadiusMeters !== undefined
          ? { defaultRadiusMeters: input.defaultRadiusMeters }
          : {}),
      },
    });

    return { data: pref };
  }

  // --------------------------------------------------------------------------
  // Account Deletion
  // --------------------------------------------------------------------------

  public async deleteAccount(userId: string) {
    await prisma.user.delete({
      where: { id: userId },
    });
    return { success: true };
  }
}
