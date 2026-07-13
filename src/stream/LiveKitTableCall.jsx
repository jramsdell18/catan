import { useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';
import { getOrCreateParticipantId } from '../game/multiplayerRoom.js';

const ROOM_PREFIX = 'catan-table-';
const ROOM_ID_LENGTH = 12;
const DISPLAY_NAME_KEY = 'catanLiveKitDisplayName';
const PLAYER_ID_KEY = 'catanLiveKitPlayerId';
const HOST_ROOM_KEY = 'catanLiveKitHostRoom';
const DATA_TOPIC = 'catan-game';
const TOKEN_ENDPOINT =
  import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || '/.netlify/functions/livekit-token';

function LiveKitTableCall({
  players,
  claimedPlayerIds = [],
  outboundMessage = null,
  onDataMessage,
  onLocalParticipantChange,
  onParticipantPresenceChange,
}) {
  const roomRef = useRef(null);
  const cleanupRoomEventsRef = useRef(null);
  const audioHostRef = useRef(null);
  const sentOutboundIdRef = useRef(null);
  const onDataMessageRef = useRef(onDataMessage);
  const onLocalParticipantChangeRef = useRef(onLocalParticipantChange);
  const onParticipantPresenceChangeRef = useRef(onParticipantPresenceChange);
  const participantId = useMemo(() => getOrCreateParticipantId(), []);
  const [displayName, setDisplayName] = useState(() => localStorage.getItem(DISPLAY_NAME_KEY) || '');
  const [selectedPlayerId, setSelectedPlayerId] = useState(() => {
    return localStorage.getItem(PLAYER_ID_KEY) || players[0]?.id || '';
  });
  const [connectionState, setConnectionState] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [participants, setParticipants] = useState([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState(() => new Set());
  const [needsAudioStart, setNeedsAudioStart] = useState(false);

  const roomInfo = useMemo(() => ensureRoomInfo(), []);
  const roomName = roomInfo.roomName;
  const inviteUrl = window.location.href;
  const isJoined = connectionState === 'connected';
  const isJoining = connectionState === 'joining';
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? players[0];
  const localParticipant = participants.find((participant) => participant.isLocal) ?? null;
  const participantsByPlayerId = useMemo(() => mapParticipantsToPlayers(participants, players), [participants, players]);
  const claimedPlayerIdSet = useMemo(() => new Set(claimedPlayerIds), [claimedPlayerIds]);
  const availablePlayers = useMemo(
    () => players.filter((player) => player.id === selectedPlayerId || !claimedPlayerIdSet.has(player.id)),
    [claimedPlayerIdSet, players, selectedPlayerId],
  );

  useEffect(() => {
    onDataMessageRef.current = onDataMessage;
    onLocalParticipantChangeRef.current = onLocalParticipantChange;
    onParticipantPresenceChangeRef.current = onParticipantPresenceChange;
  }, [onDataMessage, onLocalParticipantChange, onParticipantPresenceChange]);

  useEffect(() => {
    onLocalParticipantChangeRef.current?.({
      connected: isJoined,
      participantId,
      displayName: displayName.trim(),
      playerId: selectedPlayerId || null,
      roomName,
      isRoomCreator: roomInfo.isRoomCreator,
    });
  }, [displayName, isJoined, participantId, roomInfo.isRoomCreator, roomName, selectedPlayerId]);

  useEffect(() => {
    if (!availablePlayers.some((player) => player.id === selectedPlayerId)) {
      const nextPlayerId = availablePlayers[0]?.id || '';
      setSelectedPlayerId(nextPlayerId);
      if (nextPlayerId) {
        localStorage.setItem(PLAYER_ID_KEY, nextPlayerId);
      }
    }
  }, [availablePlayers, selectedPlayerId]);

  useEffect(() => {
    return () => {
      disposeRoom();
    };
  }, []);

  useEffect(() => {
    if (!outboundMessage || !roomRef.current || connectionState !== 'connected') {
      return;
    }
    if (sentOutboundIdRef.current === outboundMessage.id) {
      return;
    }

    sentOutboundIdRef.current = outboundMessage.id;
    publishDataMessage(roomRef.current, outboundMessage);
  }, [connectionState, outboundMessage]);

  async function handleJoin(event) {
    event.preventDefault();

    if (!selectedPlayer) {
      return;
    }

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      return;
    }

    setConnectionState('joining');
    setStatusMessage('Joining table voice...');
    localStorage.setItem(DISPLAY_NAME_KEY, trimmedName);
    localStorage.setItem(PLAYER_ID_KEY, selectedPlayer.id);

    try {
      disposeRoom();

      const credentials = await fetchLiveKitCredentials({
        roomName,
        participantName: trimmedName,
        participantIdentity: participantId,
        playerId: selectedPlayer.id,
      });

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h360.resolution,
        },
      });

      roomRef.current = room;
      cleanupRoomEventsRef.current = bindRoomEvents(room, {
        onRoomUpdate: () => refreshParticipants(room),
        onActiveSpeakers: (speakers) => {
          setActiveSpeakerIds(new Set(speakers.map((speaker) => speaker.identity)));
        },
        onAudioPlaybackStatus: () => {
          setNeedsAudioStart(!room.canPlaybackAudio);
        },
        onDisconnected: () => {
          if (roomRef.current === room) {
            cleanupRoomEventsRef.current?.();
            roomRef.current = null;
            cleanupRoomEventsRef.current = null;
            setConnectionState('idle');
            setParticipants([]);
            setActiveSpeakerIds(new Set());
            setNeedsAudioStart(false);
            setStatusMessage('Call ended.');
          }
        },
        onRemoteAudioSubscribed: (track) => attachAudioTrack(track, audioHostRef.current),
        onRemoteAudioUnsubscribed: (track) => detachAudioTrack(track),
        onDataReceived: (payload, participant) => {
          const message = decodeDataMessage(payload);
          if (message) {
            onDataMessageRef.current?.(message, {
              participantId: participant?.identity ?? null,
              displayName: participant?.name ?? participant?.identity ?? '',
            });
          }
        },
      });

      await room.connect(credentials.serverUrl, credentials.participantToken);
      await room.localParticipant.enableCameraAndMicrophone();
      attachSubscribedAudio(room, audioHostRef.current);
      refreshParticipants(room);

      if (!room.canPlaybackAudio) {
        setNeedsAudioStart(true);
      }

      setConnectionState('connected');
      setStatusMessage('');
    } catch (error) {
      disposeRoom();
      setConnectionState('idle');
      setStatusMessage(getJoinErrorMessage(error));
    }
  }

  function handleLeave() {
    disposeRoom();
    setConnectionState('idle');
    setStatusMessage('Call ended.');
  }

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setStatusMessage('Invite copied.');
    } catch {
      copyTextWithFallback(inviteUrl);
      setStatusMessage('Invite copied.');
    }

    window.setTimeout(() => setStatusMessage(''), 2200);
  }

  async function handleToggleCamera() {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);
    refreshParticipants(room);
  }

  async function handleToggleMicrophone() {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
    refreshParticipants(room);
  }

  async function handleStartAudio() {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    try {
      await room.startAudio();
      setNeedsAudioStart(false);
    } catch {
      setStatusMessage('Browser blocked audio. Click Start audio again.');
    }
  }

  function refreshParticipants(room = roomRef.current) {
    if (!room) {
      setParticipants([]);
      onParticipantPresenceChangeRef.current?.([]);
      return;
    }

    const nextParticipants = getRoomParticipants(room);
    setParticipants(nextParticipants);
    onParticipantPresenceChangeRef.current?.(nextParticipants);
  }

  function disposeRoom() {
    cleanupRoomEventsRef.current?.();
    cleanupRoomEventsRef.current = null;

    if (roomRef.current) {
      detachRoomAudio(roomRef.current);
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    if (audioHostRef.current) {
      audioHostRef.current.replaceChildren();
    }

    setParticipants([]);
    setActiveSpeakerIds(new Set());
    setNeedsAudioStart(false);
  }

  return (
    <>
      <div className="table-video-layer" aria-label="Player video positions">
        {players.map((player) => {
          const participant = participantsByPlayerId.get(player.id) ?? null;
          const isSpeaking = participant ? activeSpeakerIds.has(participant.identity) : false;

          return (
            <PlayerVideoBubble
              key={player.id}
              player={player}
              participant={participant}
              isSpeaking={isSpeaking}
            />
          );
        })}
      </div>

      <div className="livekit-call-widget">
        {isJoined ? (
          <div className="livekit-control-strip" aria-label="LiveKit call controls">
            <strong>{localParticipant?.name || selectedPlayer?.label || 'Joined'}</strong>
            <button type="button" onClick={handleToggleMicrophone}>
              {localParticipant?.isMicrophoneEnabled ? 'Mute' : 'Unmute'}
            </button>
            <button type="button" onClick={handleToggleCamera}>
              {localParticipant?.isCameraEnabled ? 'Camera off' : 'Camera on'}
            </button>
            {needsAudioStart && (
              <button type="button" onClick={handleStartAudio}>
                Start audio
              </button>
            )}
            <button type="button" className="secondary-button" onClick={handleCopyInvite}>
              Copy invite
            </button>
            <button type="button" className="secondary-button" onClick={handleLeave}>
              Leave
            </button>
          </div>
        ) : (
          <form className="livekit-join-panel" onSubmit={handleJoin}>
            <div>
              <label htmlFor="livekitDisplayName">Name</label>
              <input
                id="livekitDisplayName"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={40}
                required
              />
            </div>

            <div>
              <label htmlFor="livekitPlayerSeat">Seat</label>
              <select
                id="livekitPlayerSeat"
                value={selectedPlayerId}
                onChange={(event) => setSelectedPlayerId(event.target.value)}
              >
                {availablePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.label}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={isJoining || !selectedPlayer}>
              {isJoining ? 'Joining...' : 'Join call'}
            </button>
            <button type="button" className="secondary-button" onClick={handleCopyInvite}>
              Copy invite
            </button>
          </form>
        )}

        <p className="livekit-status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      </div>

      <div ref={audioHostRef} className="livekit-audio-outlet" aria-hidden="true" />
    </>
  );
}

function PlayerVideoBubble({ player, participant, isSpeaking }) {
  const videoRef = useRef(null);
  const cameraTrack = participant?.cameraTrack ?? null;
  const initials = getInitials(participant?.name || player.label);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !cameraTrack) {
      return undefined;
    }

    cameraTrack.attach(video);

    return () => {
      cameraTrack.detach(video);
      video.srcObject = null;
    };
  }, [cameraTrack]);

  return (
    <div
      className={`table-video-bubble table-video-seat-${player.seat}${participant ? ' is-occupied' : ''}${
        isSpeaking ? ' is-speaking' : ''
      }`}
      style={{ '--player-color': player.color }}
      title={`${player.label}${participant?.name ? `: ${participant.name}` : ''}`}
      aria-label={`${player.label} video`}
    >
      {cameraTrack ? (
        <video ref={videoRef} autoPlay muted={participant?.isLocal ?? false} playsInline />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function bindRoomEvents(room, handlers) {
  const handleRoomUpdate = () => handlers.onRoomUpdate();
  const handleTrackSubscribed = (track) => {
    if (track.kind === Track.Kind.Audio) {
      handlers.onRemoteAudioSubscribed(track);
    }
    handleRoomUpdate();
  };
  const handleTrackUnsubscribed = (track) => {
    if (track.kind === Track.Kind.Audio) {
      handlers.onRemoteAudioUnsubscribed(track);
    }
    handleRoomUpdate();
  };

  const eventHandlers = [
    [RoomEvent.ParticipantConnected, handleRoomUpdate],
    [RoomEvent.ParticipantDisconnected, handleRoomUpdate],
    [RoomEvent.LocalTrackPublished, handleRoomUpdate],
    [RoomEvent.LocalTrackUnpublished, handleRoomUpdate],
    [RoomEvent.TrackSubscribed, handleTrackSubscribed],
    [RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed],
    [RoomEvent.TrackMuted, handleRoomUpdate],
    [RoomEvent.TrackUnmuted, handleRoomUpdate],
    [RoomEvent.ParticipantMetadataChanged, handleRoomUpdate],
    [RoomEvent.ParticipantNameChanged, handleRoomUpdate],
    [RoomEvent.ActiveSpeakersChanged, handlers.onActiveSpeakers],
    [RoomEvent.AudioPlaybackStatusChanged, handlers.onAudioPlaybackStatus],
    [RoomEvent.Disconnected, handlers.onDisconnected],
    [RoomEvent.DataReceived, handlers.onDataReceived],
  ];

  eventHandlers.forEach(([eventName, handler]) => {
    room.on(eventName, handler);
  });

  return () => {
    eventHandlers.forEach(([eventName, handler]) => {
      room.off(eventName, handler);
    });
  };
}

function getRoomParticipants(room) {
  return [room.localParticipant, ...room.remoteParticipants.values()].map((participant) => {
    const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
    const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);

    return {
      identity: participant.identity,
      name: participant.name || participant.identity,
      metadata: participant.metadata,
      isLocal: participant.isLocal,
      isCameraEnabled: participant.isCameraEnabled,
      isMicrophoneEnabled: participant.isMicrophoneEnabled,
      cameraTrack: cameraPublication?.videoTrack ?? null,
      microphoneTrack: microphonePublication?.audioTrack ?? null,
    };
  });
}

function mapParticipantsToPlayers(participants, players) {
  const playerIds = new Set(players.map((player) => player.id));
  const participantMap = new Map();

  participants.forEach((participant) => {
    const metadataPlayerId = getMetadataPlayerId(participant.metadata);
    const playerId = playerIds.has(participant.identity) ? participant.identity : metadataPlayerId;

    if (playerId && playerIds.has(playerId)) {
      participantMap.set(playerId, participant);
    }
  });

  return participantMap;
}

function getMetadataPlayerId(metadata) {
  if (!metadata) {
    return '';
  }

  try {
    return JSON.parse(metadata).playerId || '';
  } catch {
    return '';
  }
}

async function fetchLiveKitCredentials(payload) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'LiveKit token request failed.');
  }

  if (!data.serverUrl || !data.participantToken) {
    throw new Error('LiveKit token response is missing serverUrl or participantToken.');
  }

  return data;
}

function attachSubscribedAudio(room, host) {
  if (!host) {
    return;
  }

  room.remoteParticipants.forEach((participant) => {
    const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
    const audioTrack = microphonePublication?.audioTrack;

    if (audioTrack) {
      attachAudioTrack(audioTrack, host);
    }
  });
}

function attachAudioTrack(track, host) {
  if (!host || host.querySelector(`[data-track-sid="${track.sid}"]`)) {
    return;
  }

  const element = track.attach();
  element.dataset.trackSid = track.sid;
  element.autoplay = true;
  host.append(element);
}

function detachRoomAudio(room) {
  room.remoteParticipants.forEach((participant) => {
    const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
    const audioTrack = microphonePublication?.audioTrack;

    if (audioTrack) {
      detachAudioTrack(audioTrack);
    }
  });
}

function detachAudioTrack(track) {
  track.detach().forEach((element) => {
    element.remove();
  });
}

function ensureRoomInfo() {
  const params = new URLSearchParams(window.location.search);
  const existingRoom = normalizeRoomName(params.get('room') || '');

  if (existingRoom) {
    if (existingRoom !== params.get('room')) {
      params.set('room', existingRoom);
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    }

    return {
      roomName: existingRoom,
      isRoomCreator: sessionStorage.getItem(HOST_ROOM_KEY) === existingRoom,
    };
  }

  const generatedRoom = `${ROOM_PREFIX}${createRoomId()}`;
  params.set('room', generatedRoom);
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  sessionStorage.setItem(HOST_ROOM_KEY, generatedRoom);
  return { roomName: generatedRoom, isRoomCreator: true };
}

function normalizeRoomName(value) {
  return value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 80);
}

function createRoomId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replaceAll('-', '').slice(0, ROOM_ID_LENGTH);
  }

  return Math.random().toString(36).slice(2, 2 + ROOM_ID_LENGTH);
}

function getInitials(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function getJoinErrorMessage(error) {
  if (error?.message?.includes('Failed to fetch')) {
    return 'Token endpoint is not reachable. On Netlify, set the LiveKit env vars and use the deployed URL.';
  }

  return error?.message || 'Could not join the LiveKit room.';
}

function copyTextWithFallback(text) {
  const copyTarget = document.createElement('textarea');
  copyTarget.value = text;
  copyTarget.setAttribute('readonly', '');
  copyTarget.style.position = 'fixed';
  copyTarget.style.top = '-1000px';
  document.body.append(copyTarget);
  copyTarget.select();
  document.execCommand('copy');
  copyTarget.remove();
}

function publishDataMessage(room, message) {
  const payload = new TextEncoder().encode(JSON.stringify(message));
  room.localParticipant.publishData(payload, {
    reliable: true,
    topic: DATA_TOPIC,
  });
}

function decodeDataMessage(payload) {
  try {
    const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    const message = JSON.parse(text);
    if (!message || message.topic !== DATA_TOPIC || !message.type) return null;
    return message;
  } catch {
    return null;
  }
}

export default LiveKitTableCall;
