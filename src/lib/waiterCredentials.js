const normaliseName = (value) => String(value || "").trim();

export function getWaiterCredentials(subAdmin) {
  const storedWaiters = Array.isArray(subAdmin?.waiters)
    ? subAdmin.waiters
        .map((waiter) => ({
          name: normaliseName(waiter?.name),
          password: String(waiter?.password || ""),
        }))
        .filter((waiter) => waiter.name && waiter.password)
    : [];

  if (storedWaiters.length > 0) {
    return storedWaiters;
  }

  // Restaurants created before multi-waiter support keep working until their
  // existing credentials are migrated or managed from the settings screen.
  const legacyName = normaliseName(subAdmin?.waiterName);
  const legacyPassword = String(subAdmin?.waiterPassword || "");
  return legacyName && legacyPassword ? [{ name: legacyName, password: legacyPassword }] : [];
}

export function publicWaiterCredentials(subAdmin) {
  return getWaiterCredentials(subAdmin).map(({ name }) => ({ name }));
}

export function hasWaiterCredentials(subAdmin) {
  return getWaiterCredentials(subAdmin).length > 0;
}

export function waiterNameKey(name) {
  return normaliseName(name).toLocaleLowerCase();
}
