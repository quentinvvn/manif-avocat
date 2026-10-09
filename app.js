// Page avocat : vérifie le lien, télécharge les segments chiffrés,
// les vérifie et les déchiffre dans le navigateur.
import { FUNCTION_URL } from './config.js';
import {
  parseFragment, unwrapContentKey, decryptSegment, sha256, chainLink, bytesToHex,
  LinkError, DecryptError,
} from './lib.js';

const $ = (id) => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' });

let link;

function status(text, kind) {
  const el = $('status');
  el.hidden = false;
  el.textContent = text;
  el.className = `card ${kind ?? ''}`;
}

async function fetchShare() {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ share: link.shareId }),
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 410) {
    throw new Error(`Ce lien a expiré le ${dateFormat.format(new Date(body.expires_at))}.`);
  }
  if (response.status === 404) throw new Error('Ce lien n\'existe pas ou a été révoqué.');
  if (!response.ok) throw new Error('Le service est indisponible. Réessayez plus tard.');
  return body;
}

async function init() {
  try {
    link = parseFragment(location.hash);
  } catch (e) {
    status(e instanceof LinkError ? 'Ce lien est incomplet. Demandez à la personne de vous le renvoyer en entier.' : 'Lien illisible.', 'bad');
    return;
  }
  try {
    const share = await fetchShare();
    $('captured').textContent = share.captured_at ? dateFormat.format(new Date(share.captured_at)) : '—';
    $('source').textContent = share.source === 'import'
      ? 'Importée depuis la galerie du téléphone'
      : 'Filmée dans l\'application (enregistrée au fil de l\'eau)';
    $('count').textContent = String(share.segments.length);
    $('expires').textContent = dateFormat.format(new Date(share.expires_at));
    $('status').hidden = true;
    $('details').hidden = false;
    $('open').addEventListener('click', open, { once: true });
  } catch (e) {
    status(e.message, 'bad');
  }
}

async function open() {
  const button = $('open');
  const progress = $('progress');
  button.disabled = true;
  progress.hidden = false;
  try {
    // Liens de téléchargement frais (valables quelques minutes).
    const share = await fetchShare();
    const contentKey = await unwrapContentKey(link.key, share.wrapped_key, link.shareId);
    const parts = [];
    let head = new Uint8Array(32);
    let intact = true;
    for (const [i, segment] of share.segments.entries()) {
      const response = await fetch(segment.url, { referrerPolicy: 'no-referrer', cache: 'no-store' });
      if (!response.ok) throw new Error('Téléchargement interrompu. Rechargez la page.');
      const sealed = new Uint8Array(await response.arrayBuffer());
      const clear = await decryptSegment(contentKey, share.video_id, segment.index, sealed);
      const hash = await sha256(clear);
      if (bytesToHex(hash) !== segment.sha256) intact = false;
      head = await chainLink(head, hash);
      parts.push(clear);
      progress.value = (i + 1) / share.segments.length;
    }
    show(share, parts, intact, head);
  } catch (e) {
    progress.hidden = true;
    status(e instanceof DecryptError
      ? 'Impossible de déchiffrer : le lien est incomplet ou a été modifié.'
      : e.message, 'bad');
  }
}

function show(share, parts, intact, head) {
  $('details').hidden = true;
  $('player').hidden = false;
  const integrity = $('integrity');
  integrity.textContent = intact
    ? 'Chaque segment correspond à l\'empreinte enregistrée au moment de filmer.'
    : 'Attention : au moins un segment ne correspond pas à son empreinte.';
  integrity.className = intact ? 'good' : 'bad';
  $('chain').textContent = bytesToHex(head);

  const downloads = $('downloads');
  const video = $('video');
  const label = $('segment-label');
  const stamp = share.video_id.slice(0, 8);

  if (share.source === 'import') {
    // Vidéo importée : morceaux d'un même fichier, recollés.
    const url = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
    video.src = url;
    downloads.append(item(url, `manif-${stamp}-original.mp4`, 'Vidéo originale (fichier d\'origine, octet pour octet)'));
  } else {
    // Filmée dans l'app : un fichier MP4 complet par segment de 5 s, lus à la suite.
    const urls = parts.map((p) => URL.createObjectURL(new Blob([p], { type: 'video/mp4' })));
    let current = 0;
    const play = (i) => {
      current = i;
      video.src = urls[i];
      label.textContent = `Segment ${i + 1} sur ${urls.length}`;
    };
    video.addEventListener('ended', () => {
      if (current + 1 < urls.length) {
        play(current + 1);
        video.play();
      }
    });
    play(0);
    urls.forEach((url, i) => downloads.append(
      item(url, `manif-${stamp}-segment-${String(i).padStart(6, '0')}.mp4`, `Segment ${i + 1}`)));
  }

  const manifest = {
    video_id: share.video_id,
    captured_at: share.captured_at,
    source: share.source,
    segments: share.segments.map((s) => ({ index: s.index, sha256: s.sha256 })),
    chain_sha256: bytesToHex(head),
    verified_at: new Date().toISOString(),
  };
  const manifestUrl = URL.createObjectURL(
    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
  downloads.append(item(manifestUrl, `manif-${stamp}-empreintes.json`, 'Empreintes (pour vérification)'));
}

function item(url, filename, text) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.textContent = text;
  li.append(a);
  return li;
}

init();
