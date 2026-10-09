// Fonctions de déchiffrement de la page avocat, sans dépendance :
// WebCrypto du navigateur (ou de Node pour les tests).
//
// Format des données chiffrées (noyau manif_crypto, Envelope) :
//   [version = 1][nonce : 12 octets][chiffré][tag : 16 octets]
// AES-256-GCM, avec un contexte (« associated data ») qui lie chaque
// chiffré à son usage : un segment déplacé ou échangé ne se déchiffre pas.

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();

export class LinkError extends Error {}
export class DecryptError extends Error {}

/** Lit « #s=<id>&k=<clé base64url> ». Lance LinkError si le lien est incomplet. */
export function parseFragment(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const shareId = params.get('s');
  const k = params.get('k');
  if (!shareId || !k) throw new LinkError('Lien incomplet');
  const key = base64UrlToBytes(k);
  if (key.length !== 32) throw new LinkError('Clé de taille incorrecte');
  return { shareId, key };
}

export function base64UrlToBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new LinkError('Clé illisible');
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new DecryptError('Hexadécimal invalide');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Déchiffre une enveloppe ; DecryptError si la clé ou le contexte ne vont pas. */
export async function openEnvelope(keyBytes, sealed, context) {
  if (sealed.length < 29 || sealed[0] !== 1) throw new DecryptError('Format inconnu');
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  try {
    const clear = await subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(1, 13), additionalData: encoder.encode(context), tagLength: 128 },
      key,
      sealed.slice(13),
    );
    return new Uint8Array(clear);
  } catch {
    throw new DecryptError('Clé incorrecte ou données modifiées');
  }
}

/** Clé de contenu de la vidéo, déballée avec la clé du lien. */
export function unwrapContentKey(shareKey, wrappedHex, shareId) {
  return openEnvelope(shareKey, hexToBytes(wrappedHex), `manif/v1/share/${shareId}`);
}

export function decryptSegment(contentKey, videoId, index, sealed) {
  return openEnvelope(contentKey, sealed, `manif/v1/segment/${videoId}/${index}`);
}

export async function sha256(bytes) {
  return new Uint8Array(await subtle.digest('SHA-256', bytes));
}

/** Maillon suivant de la chaîne d'empreintes : SHA-256(précédent ‖ empreinte du segment). */
export async function chainLink(previous, segmentHash) {
  const joined = new Uint8Array(previous.length + segmentHash.length);
  joined.set(previous, 0);
  joined.set(segmentHash, previous.length);
  return sha256(joined);
}
