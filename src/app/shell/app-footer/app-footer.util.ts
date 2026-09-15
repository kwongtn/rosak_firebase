export const FRONTEND_REPO_URL = "https://github.com/kwongtn/rosak_firebase";
export const BACKEND_REPO_URL = "https://github.com/kwongtn/lift-rosak-backend";

export function isValidHash(hash: string): boolean {
  if (!hash || hash === "unknown" || hash === "<<No hash data>>") {
    return false;
  }
  return /^[0-9a-f]{7,40}$/i.test(hash);
}

export function toShortHash(hash: string): string {
  return isValidHash(hash) ? hash.slice(0, 7) : hash;
}

export function frontendCommitUrl(hash: string): string {
  return `${FRONTEND_REPO_URL}/commit/${hash}`;
}

export function backendCommitUrl(hash: string): string {
  return `${BACKEND_REPO_URL}/commit/${hash}`;
}
