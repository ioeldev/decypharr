export function readPreference(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    // Browser storage is optional; private browsing policies must not prevent rendering.
    return null;
  }
}

export function savePreference(name: string, value: string): void {
  try {
    localStorage.setItem(name, value);
  } catch {
    // The current page still applies the preference when persistence is unavailable.
  }
}
