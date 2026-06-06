// Netlify Function: save-content
// POST { password, type: 'content', content: {...} }  → updates assets/content.json
// POST { password, type: 'upload', path: 'assets/...', data: '<base64>' }  → uploads a file

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return jsonReply(400, { error: 'Invalid JSON' });
  }

  const { ADMIN_PASSWORD, GITHUB_TOKEN } = process.env;
  const OWNER = process.env.GITHUB_OWNER || 'BreoganDev';
  const REPO  = process.env.GITHUB_REPO  || 'landingveronica';
  const BRANCH = process.env.GITHUB_BRANCH || 'main';

  if (!ADMIN_PASSWORD) return jsonReply(500, { error: 'ADMIN_PASSWORD no configurado' });
  if (!GITHUB_TOKEN)   return jsonReply(500, { error: 'GITHUB_TOKEN no configurado' });

  if (!body.password || body.password !== ADMIN_PASSWORD) {
    return jsonReply(401, { error: 'Contraseña incorrecta' });
  }

  const ghHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LandingVeronica-Admin',
    'Content-Type': 'application/json'
  };

  async function getSha(path) {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: ghHeaders }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return d.sha || null;
  }

  async function putFile(path, base64Content, message, sha) {
    const payload = { message, content: base64Content, branch: BRANCH };
    if (sha) payload.sha = sha;
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
      { method: 'PUT', headers: ghHeaders, body: JSON.stringify(payload) }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API error ${res.status}`);
    }
    return res.json();
  }

  try {
    if (body.type === 'ping') {
      return jsonReply(200, { ok: true });
    }

    if (body.type === 'content') {
      const sha = await getSha('assets/content.json');
      const base64 = Buffer.from(
        JSON.stringify(body.content, null, 2),
        'utf8'
      ).toString('base64');
      await putFile('assets/content.json', base64, 'actualiza contenido landing', sha);
      return jsonReply(200, { ok: true });
    }

    if (body.type === 'upload') {
      if (!body.path || !body.data) return jsonReply(400, { error: 'path y data requeridos' });
      const sha = await getSha(body.path);
      await putFile(body.path, body.data, `sube: ${body.path}`, sha);
      return jsonReply(200, { ok: true, path: body.path });
    }

    return jsonReply(400, { error: 'Tipo desconocido' });

  } catch (err) {
    return jsonReply(500, { error: err.message });
  }
};

function jsonReply(status, obj) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
