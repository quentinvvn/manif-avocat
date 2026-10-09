// Tests de la page avocat : node test.mjs
// Vecteurs calculés avec Python (cryptography) et vérifiés aussi par le
// noyau Dart (packages/manif_crypto/test/share_crypto_test.dart).
import assert from 'node:assert/strict';
import {
  parseFragment, unwrapContentKey, decryptSegment, sha256, chainLink, bytesToHex, hexToBytes,
  LinkError, DecryptError,
} from './lib.js';

const shareId = '33333333-4444-5555-6666-777777777777';
const videoId = '11111111-2222-3333-4444-555555555555';
const wrapped = '01000102030405060708090a0b1c131fe40e70adabf4b0838d6a3e10734321bb'
  + '373e44f0467c5489e1e7dc95c7c8ee81af0326f960432e168681dfa793';
const segment0 = '016465666768696a6b6c6d6e6f821b610930fcb292fd7e1266be07c147774f373de500f6b476';

const link = parseFragment(`#s=${shareId}&k=ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8`);
assert.equal(link.shareId, shareId);
assert.deepEqual(Array.from(link.key), Array.from({ length: 32 }, (_, i) => 32 + i));

const contentKey = await unwrapContentKey(link.key, wrapped, shareId);
assert.deepEqual(Array.from(contentKey), Array.from({ length: 32 }, (_, i) => 64 + i));

const clear = await decryptSegment(contentKey, videoId, 0, hexToBytes(segment0));
assert.equal(new TextDecoder().decode(clear), 'segment 0');

// Même empreinte et même chaîne que le noyau Dart (video_crypto_test.dart).
const h0 = await sha256(clear);
assert.equal(bytesToHex(h0), 'c0dafc1f67ee55a51c4920215b92cd209abb62615bff1ae83fd62f8d310d1289');
assert.equal(bytesToHex(await chainLink(new Uint8Array(32), h0)),
  '5473f55958374a7c89a134e77b658d5c1aa8e2c6c8d5ca3d55d4e36dd0d5ce1d');

// Segment présenté sous un autre numéro : refusé.
await assert.rejects(decryptSegment(contentKey, videoId, 1, hexToBytes(segment0)), DecryptError);
// Autre partage : la clé ne s'ouvre pas.
await assert.rejects(unwrapContentKey(link.key, wrapped, 'autre'), DecryptError);
// Liens incomplets.
assert.throws(() => parseFragment('#s=abc'), LinkError);
assert.throws(() => parseFragment('#s=abc&k=AAAA'), LinkError);

console.log('page avocat : 9 vérifications OK');
