import { useEffect, useState } from 'preact/hooks';

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => normalize(location.hash));
  useEffect(() => {
    const onChange = () => setHash(normalize(location.hash));
    globalThis.addEventListener('hashchange', onChange);
    return () => globalThis.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function navigate(to: string): void {
  location.hash = to.startsWith('#') ? to : `#${to}`;
}

function normalize(raw: string): string {
  if (!raw || raw === '#') return '/';
  return raw.replace(/^#/, '');
}

export function matchRoute(hash: string, pattern: string): Record<string, string> | null {
  const hashParts = hash.split('/').filter(Boolean);
  const patParts = pattern.split('/').filter(Boolean);
  if (hashParts.length !== patParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    const p = patParts[i];
    const h = hashParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(h);
    } else if (p !== h) {
      return null;
    }
  }
  return params;
}
