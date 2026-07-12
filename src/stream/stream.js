const JITSI_DOMAIN = 'meet.jit.si';
const ROOM_PREFIX = 'catan-table-';
const ROOM_ID_LENGTH = 12;
const API_WAIT_TIMEOUT_MS = 10000;

const joinPanel = document.querySelector('#joinPanel');
const callPanel = document.querySelector('#callPanel');
const joinForm = document.querySelector('#joinForm');
const displayNameInput = document.querySelector('#displayName');
const inviteLinkInput = document.querySelector('#inviteLink');
const copyInviteButton = document.querySelector('#copyInvite');
const copyInviteActiveButton = document.querySelector('#copyInviteActive');
const copyStatus = document.querySelector('#copyStatus');
const leaveCallButton = document.querySelector('#leaveCall');
const meetFrame = document.querySelector('#meetFrame');
const callTitle = document.querySelector('#callTitle');

let jitsiApi = null;
let copyStatusTimer = null;

const roomName = ensureRoomName();
const inviteUrl = window.location.href;

inviteLinkInput.value = inviteUrl;
displayNameInput.value = localStorage.getItem('catanStreamDisplayName') || '';
callTitle.textContent = roomName;

joinForm.addEventListener('submit', handleJoin);
copyInviteButton.addEventListener('click', copyInviteLink);
copyInviteActiveButton.addEventListener('click', copyInviteLink);
leaveCallButton.addEventListener('click', leaveCall);

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

async function handleJoin(event) {
  event.preventDefault();

  const displayName = displayNameInput.value.trim();
  if (!displayName) {
    displayNameInput.focus();
    return;
  }

  localStorage.setItem('catanStreamDisplayName', displayName);
  joinPanel.hidden = true;
  callPanel.hidden = false;

  try {
    await waitForJitsiApi();
    startCall(displayName);
  } catch {
    leaveCall();
    showCopyStatus('Video service did not load. Check your connection and try again.');
  }
}

function waitForJitsiApi() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.JitsiMeetExternalAPI) {
        window.clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > API_WAIT_TIMEOUT_MS) {
        window.clearInterval(timer);
        reject(new Error('Jitsi Meet API timed out.'));
      }
    }, 100);
  });
}

function startCall(displayName) {
  meetFrame.replaceChildren();

  jitsiApi = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
    roomName,
    parentNode: meetFrame,
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

  jitsiApi.addEventListener('videoConferenceJoined', () => {
    jitsiApi.executeCommand('displayName', displayName);
  });
}

function leaveCall() {
  if (jitsiApi) {
    jitsiApi.dispose();
    jitsiApi = null;
  }

  meetFrame.replaceChildren();
  callPanel.hidden = true;
  joinPanel.hidden = false;
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showCopyStatus('Invite link copied.');
  } catch {
    copyTextWithFallback(inviteUrl);
    showCopyStatus('Invite link copied.');
  }
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

function showCopyStatus(message) {
  copyStatus.textContent = message;
  window.clearTimeout(copyStatusTimer);
  copyStatusTimer = window.setTimeout(() => {
    copyStatus.textContent = '';
  }, 2500);
}
