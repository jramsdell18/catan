import { useEffect, useMemo, useRef, useState } from 'react';

const JITSI_DOMAIN = 'meet.jit.si';
const ROOM_PREFIX = 'catan-table-';
const ROOM_ID_LENGTH = 12;
const API_SCRIPT_ID = 'jitsi-external-api';
const DISPLAY_NAME_KEY = 'catanStreamDisplayName';

function JitsiOverlay() {
  const meetFrameRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem(DISPLAY_NAME_KEY) || '';
  });
  const [isJoined, setIsJoined] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const roomName = useMemo(() => ensureRoomName(), []);
  const inviteUrl = window.location.href;

  useEffect(() => {
    return () => {
      disposeCall(jitsiApiRef);
    };
  }, []);

  useEffect(() => {
    if (!isJoined) {
      return undefined;
    }

    let isCancelled = false;

    loadJitsiApi()
      .then(() => {
        if (isCancelled || !meetFrameRef.current) {
          return;
        }

        disposeCall(jitsiApiRef);
        meetFrameRef.current.replaceChildren();

        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: meetFrameRef.current,
          width: '100%',
          height: '100%',
          userInfo: {
            displayName,
          },
          configOverwrite: {
            disableDeepLinking: true,
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
          },
        });

        api.addEventListener('videoConferenceJoined', () => {
          api.executeCommand('displayName', displayName);
        });
        api.addEventListener('videoConferenceLeft', () => {
          setIsJoined(false);
        });
        api.addEventListener('readyToClose', () => {
          setIsJoined(false);
        });

        jitsiApiRef.current = api;
      })
      .catch(() => {
        setIsJoined(false);
        setStatusMessage('Video service did not load. Try again in a moment.');
      });

    return () => {
      isCancelled = true;
      disposeCall(jitsiApiRef);
    };
  }, [displayName, isJoined, roomName]);

  function handleJoin(event) {
    event.preventDefault();

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      return;
    }

    localStorage.setItem(DISPLAY_NAME_KEY, trimmedName);
    setDisplayName(trimmedName);
    setIsJoined(true);
    setStatusMessage('');
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

  return (
    <section
      className={`video-call-panel${isJoined ? ' video-call-panel-active' : ''}`}
      aria-labelledby="video-overlay-title"
    >
      {isJoined ? (
        <div className="video-frame" ref={meetFrameRef} aria-label="Jitsi video call" />
      ) : (
        <div className="video-join-card">
          <header>
            <p className="eyebrow">Table call</p>
            <h2 id="video-overlay-title">Voice and video</h2>
          </header>

          <form className="video-join-form" onSubmit={handleJoin}>
            <div className="video-name-field">
              <label htmlFor="videoDisplayName">Name</label>
              <input
                id="videoDisplayName"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                maxLength={40}
                required
              />
            </div>
            <button type="submit">Join call</button>
            <button className="secondary-button" type="button" onClick={handleCopyInvite}>
              Copy invite
            </button>
          </form>

          <p className="call-status" role="status" aria-live="polite">
            {statusMessage}
          </p>
        </div>
      )}
    </section>
  );
}

function ensureRoomName() {
  const params = new URLSearchParams(window.location.search);
  const existingRoom = normalizeRoomName(params.get('room') || '');

  if (existingRoom) {
    if (existingRoom !== params.get('room')) {
      params.set('room', existingRoom);
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    }

    return existingRoom;
  }

  const generatedRoom = `${ROOM_PREFIX}${createRoomId()}`;
  params.set('room', generatedRoom);
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  return generatedRoom;
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

function loadJitsiApi() {
  if (window.JitsiMeetExternalAPI) {
    return Promise.resolve();
  }

  const existingScript = document.getElementById(API_SCRIPT_ID);
  if (existingScript) {
    return waitForJitsiApi(existingScript);
  }

  const script = document.createElement('script');
  script.id = API_SCRIPT_ID;
  script.src = `https://${JITSI_DOMAIN}/external_api.js`;
  script.async = true;
  document.head.append(script);

  return waitForJitsiApi(script);
}

function waitForJitsiApi(script) {
  return new Promise((resolve, reject) => {
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
  }).then(() => {
    if (!window.JitsiMeetExternalAPI) {
      throw new Error('Jitsi API did not initialize.');
    }
  });
}

function disposeCall(apiRef) {
  if (!apiRef.current) {
    return;
  }

  apiRef.current.dispose();
  apiRef.current = null;
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

export default JitsiOverlay;
