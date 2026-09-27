import { useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';
import { getOrCreateParticipantId } from '../game/multiplayerRoom.js';

const ROOM_PREFIX = 'catan-table-';
const ROOM_ID_LENGTH = 12;
const DISPLAY_NAME_KEY = 'catanLiveKitDisplayName';
const HOST_ROOM_KEY = 'catanLiveKitHostRoom';
const DATA_TOPIC = 'catan-game';
const TOKEN_ENDPOINT =
  import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || '/.netlify/functions/livekit-token';

function LiveKitTableCall({
  players,
  playerStats = [],
  seatAssignments = null,
  publishMedia = false,
  leaveSignal = 0,
  hideJoin = false,
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
  const [connectionState, setConnectionState] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [participants, setParticipants] = useState([]);
  const [activeSpeakerIds, setActiveSpeakerIds] = useState(() => new Set());
  const [needsAudioStart, setNeedsAudioStart] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(true);

  const roomInfo = useMemo(() => ensureRoomInfo(), []);
  const roomName = roomInfo.roomName;
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomName}`;
  const isJoined = connectionState === 'connected';
  const isJoining = connectionState === 'joining';
  const localParticipant = participants.find((participant) => participant.isLocal) ?? null;
  const mediaPublishedRef = useRef(false);
  const participantsByPlayerId = useMemo(
    () => mapParticipantsToPlayers(participants, players, seatAssignments),
    [participants, players, seatAssignments],
  );
  const statsByPlayerId = useMemo(
    () => new Map(playerStats.map((stats) => [stats.playerId, stats])),
    [playerStats],
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
      playerId: null,
      roomName,
      isRoomCreator: roomInfo.isRoomCreator,
    });
  }, [displayName, isJoined, participantId, roomInfo.isRoomCreator, roomName]);

  // Camera and mic start only once the host has confirmed this person's color.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isJoined || !publishMedia || mediaPublishedRef.current) return;
    mediaPublishedRef.current = true;
    room.localParticipant.enableCameraAndMicrophone()
      .then(() => refreshParticipants(room))
      .catch(() => setStatusMessage('Camera or microphone is blocked. You can still play.'));
  }, [isJoined, publishMedia]);

  const lastLeaveSignalRef = useRef(leaveSignal);
  useEffect(() => {
    if (leaveSignal === lastLeaveSignalRef.current) return;
    lastLeaveSignalRef.current = leaveSignal;
    disposeRoom();
    setConnectionState('idle');
    setStatusMessage('');
  }, [leaveSignal]);

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

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      return;
    }

    setConnectionState('joining');
    setStatusMessage(roomInfo.isRoomCreator ? 'Creating lobby…' : 'Joining lobby…');
    localStorage.setItem(DISPLAY_NAME_KEY, trimmedName);

    try {
      disposeRoom();

      const credentials = await fetchLiveKitCredentials({
        roomName,
        participantName: trimmedName,
        participantIdentity: participantId,
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
      mediaPublishedRef.current = false;
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
    setControlsCollapsed(true);
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
    setControlsCollapsed(true);
  }

  return (
    <>
      <div className="table-video-layer" aria-label="Player video positions">
        {players.map((player) => {
          const participant = participantsByPlayerId.get(player.id) ?? null;
          // Empty seats get no bubble, so the lobby and board stay uncluttered.
          if (!participant) return null;
          const isSpeaking = participant ? activeSpeakerIds.has(participant.identity) : false;
          const stats = statsByPlayerId.get(player.id) ?? null;

          return (
            <PlayerVideoBubble
              key={player.id}
              player={player}
              participant={participant}
              isSpeaking={isSpeaking}
              stats={stats}
            />
          );
        })}
      </div>

      {isJoined ? (
      <div className="livekit-call-widget">
          {controlsCollapsed ? (
            <button
              type="button"
              className={`livekit-collapse-toggle${localParticipant?.isMicrophoneEnabled ? '' : ' is-muted'}`}
              onClick={() => setControlsCollapsed(false)}
              aria-label="Open voice controls"
              title="Open voice controls"
              data-testid="open-voice-controls"
            >
              <span aria-hidden="true">{localParticipant?.isMicrophoneEnabled ? 'Mic' : 'Mute'}</span>
            </button>
          ) : (
            <div className="livekit-control-strip" aria-label="LiveKit call controls">
              <div className="livekit-control-heading">
                <strong>{localParticipant?.name || 'Joined'}</strong>
                <button
                  type="button"
                  className="livekit-icon-button"
                  onClick={() => setControlsCollapsed(true)}
                  aria-label="Collapse voice controls"
                  title="Collapse voice controls"
                  data-testid="collapse-voice-controls"
                >
                  -
                </button>
              </div>
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
          )}
        {(!controlsCollapsed || statusMessage) && (
          <p className="livekit-status" role="status" aria-live="polite">
            {statusMessage}
          </p>
        )}
      </div>
      ) : !hideJoin && (
          <form className="start-overlay lobby-card lobby-join" onSubmit={handleJoin} data-testid="lobby-join" aria-labelledby="lobby-join-title">
            <p className="eyebrow">{roomInfo.isRoomCreator ? 'Catan with friends' : 'You’re invited'}</p>
            <h1 id="lobby-join-title">{roomInfo.isRoomCreator ? 'Host a game' : 'Join the game'}</h1>
            <p className="helper-text">
              {roomInfo.isRoomCreator
                ? 'Enter your name to open a lobby, then share the invite link.'
                : 'Enter your name, then pick a color in the lobby.'}
            </p>
            <div className="lobby-field">
              <label className="lobby-label" htmlFor="livekitDisplayName">Your name</label>
              <input
                id="livekitDisplayName"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={40}
                required
                data-testid="lobby-name"
              />
            </div>
            <button type="submit" className="lobby-primary" disabled={isJoining} data-testid="join-lobby">
              {isJoining ? 'Connecting…' : roomInfo.isRoomCreator ? 'Create lobby' : 'Continue'}
            </button>
            <p className="livekit-status" role="status" aria-live="polite">{statusMessage}</p>
            <p className="lobby-footnote">Voice and camera start after you pick a color. Want to play alone? Use the ⚙ settings button.</p>
          </form>
      )}

      <div ref={audioHostRef} className="livekit-audio-outlet" aria-hidden="true" />
    </>
  );
}

function PlayerVideoBubble({ player, participant, isSpeaking, stats }) {
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
    <div className={`table-video-seat table-video-seat-${player.seat}`}>
      <div
        className={`table-video-bubble${participant ? ' is-occupied' : ''}${
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
      <div className="table-video-stats" aria-label={`${player.label} table stats`}>
        <span title="Resource cards"><b>C</b>{stats?.cards ?? 0}</span>
        <span title="Victory points"><b>VP</b>{stats?.victoryPoints ?? 0}</span>
        <span title="Development cards"><b>D</b>{stats?.developmentCards ?? 0}</span>
      </div>
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

function mapParticipantsToPlayers(participants, players, seatAssignments = null) {
  const playerIds = new Set(players.map((player) => player.id));
  const participantMap = new Map();
  const seatByIdentity = new Map(
    Object.entries(seatAssignments ?? {}).map(([playerId, identity]) => [identity, playerId]),
  );

  participants.forEach((participant) => {
    const seatPlayerId = seatByIdentity.get(participant.identity);
    if (seatPlayerId && playerIds.has(seatPlayerId)) {
      participantMap.set(seatPlayerId, participant);
      return;
    }
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
