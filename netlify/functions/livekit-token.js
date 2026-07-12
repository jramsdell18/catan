import { AccessToken } from 'livekit-server-sdk';

const ROOM_MAX_LENGTH = 80;
const IDENTITY_MAX_LENGTH = 64;
const NAME_MAX_LENGTH = 40;

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Use POST to create a LiveKit token.' });
  }

  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    return jsonResponse(500, {
      error: 'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  const roomName = normalizeRoomName(payload.roomName);
  const participantName = normalizeName(payload.participantName);
  const playerId = normalizeIdentity(payload.playerId);
  const participantIdentity = normalizeIdentity(payload.participantIdentity || playerId);

  if (!roomName || !participantName || !participantIdentity || !playerId) {
    return jsonResponse(400, {
      error: 'roomName, participantName, and playerId are required.',
    });
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    metadata: JSON.stringify({ playerId }),
    ttl: '2h',
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  return jsonResponse(200, {
    serverUrl: livekitUrl,
    participantToken: await token.toJwt(),
  });
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function normalizeRoomName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, ROOM_MAX_LENGTH);
}

function normalizeIdentity(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .slice(0, IDENTITY_MAX_LENGTH);
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
}
