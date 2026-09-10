export interface PackageServiceAllocation {
  serviceId: string;
  quantity: number;
}

export interface GeneratedSession {
  serviceId: string;
  ordinal: number;
}

export function generatePackageSessions(
  items: PackageServiceAllocation[],
): GeneratedSession[] {
  if (items.length === 0) {
    throw new Error('A package must contain at least one service.');
  }

  const seenServiceIds = new Set<string>();
  const sessions: GeneratedSession[] = [];

  for (const item of items) {
    if (!item.serviceId.trim()) {
      throw new Error('Package service id is required.');
    }

    if (seenServiceIds.has(item.serviceId)) {
      throw new Error('A service can only appear once in a package definition.');
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Package service quantity must be a positive integer.');
    }

    seenServiceIds.add(item.serviceId);

    for (let ordinal = 1; ordinal <= item.quantity; ordinal += 1) {
      sessions.push({ serviceId: item.serviceId, ordinal });
    }
  }

  return sessions;
}
