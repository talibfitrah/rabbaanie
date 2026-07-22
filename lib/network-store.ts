import AsyncStorage from "@react-native-async-storage/async-storage";

// ============ TYPES ============

export type NetworkCategory = "parents" | "teachers" | "scholars" | "doctors";

export interface NetworkPerson {
  id: string;
  category: NetworkCategory;
  name: string;
  specialization: string; // vak, specialisatie
  institution: string; // school, praktijk
  contact: string; // tel/email
  notes: string;
  publicId?: string; // for parents: their user public ID
  createdAt: string; // ISO date
}

// ============ STORAGE ============

const NETWORK_STORAGE_KEY = "@network_contacts";

export async function loadNetwork(): Promise<NetworkPerson[]> {
  try {
    const raw = await AsyncStorage.getItem(NETWORK_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export async function saveNetwork(contacts: NetworkPerson[]): Promise<void> {
  await AsyncStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(contacts));
}

export async function addNetworkPerson(person: NetworkPerson): Promise<NetworkPerson[]> {
  const current = await loadNetwork();
  const updated = [person, ...current];
  await saveNetwork(updated);
  return updated;
}

export async function updateNetworkPerson(id: string, data: Partial<NetworkPerson>): Promise<NetworkPerson[]> {
  const current = await loadNetwork();
  const updated = current.map((p) => (p.id === id ? { ...p, ...data } : p));
  await saveNetwork(updated);
  return updated;
}

export async function removeNetworkPerson(id: string): Promise<NetworkPerson[]> {
  const current = await loadNetwork();
  const updated = current.filter((p) => p.id !== id);
  await saveNetwork(updated);
  return updated;
}

export function getByCategory(contacts: NetworkPerson[], category: NetworkCategory): NetworkPerson[] {
  return contacts.filter((c) => c.category === category);
}

export function generatePersonId(): string {
  return `NP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
