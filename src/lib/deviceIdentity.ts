const DEVICE_ID_KEY = "balance-game:device-id";
const NICKNAME_KEY = "balance-game:nickname";

export function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getNickname(): string | null {
  return window.localStorage.getItem(NICKNAME_KEY);
}

export function setNickname(nickname: string): void {
  window.localStorage.setItem(NICKNAME_KEY, nickname);
}
