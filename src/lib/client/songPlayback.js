// src/lib/client/songPlayback.js
// Web Audio scheduling for song-quiz playback. All-or-nothing: every step
// (AudioContext creation, fetch, decode, schedule) must succeed, otherwise
// the caller is expected to surface the failure to the user. There is no
// HTMLAudioElement fallback.

function createAudioContext() {
	if (typeof window === 'undefined') {
		throw new Error('AudioContext is not available in this environment');
	}
	const Ctor = window.AudioContext || window.webkitAudioContext;
	if (!Ctor) {
		throw new Error('Web Audio API is not supported in this browser');
	}
	return new Ctor();
}

export class SongPlayback {
	constructor() {
		this.audioContext = null;
		this.audioBuffer = null;
		this.activeSource = null;
		this.lastUrl = null;
	}

	async ensureAudioContext() {
		if (!this.audioContext) {
			this.audioContext = createAudioContext();
		}
		if (this.audioContext.state === 'suspended') {
			await this.audioContext.resume();
			if (this.audioContext.state !== 'running') {
				throw new Error('AudioContext could not be resumed - need a user gesture');
			}
		}
		return this.audioContext;
	}

	async load(url) {
		this.unload();
		const ctx = await this.ensureAudioContext();

		const response = await fetch(url, { cache: 'force-cache' });
		if (!response.ok) {
			throw new Error(`Audio fetch failed: HTTP ${response.status}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		this.audioBuffer = await ctx.decodeAudioData(arrayBuffer);
		this.lastUrl = url;
	}

	isReady() {
		return !!this.audioBuffer && !!this.audioContext;
	}

	cancelScheduled() {
		if (this.activeSource) {
			try {
				this.activeSource.stop();
			} catch {
				// already stopped
			}
			try {
				this.activeSource.disconnect();
			} catch {
				// already disconnected
			}
			this.activeSource = null;
		}
	}

	// Schedules sample-accurate Web Audio playback for the given server-clock
	// timestamp (ms), starting `offsetSec` into the decoded buffer. Throws if
	// the buffer is not loaded or the context is not running.
	async scheduleAt({ playAtMs, serverNowProvider, offsetSec = 0 }) {
		if (!this.isReady()) {
			throw new Error('SongPlayback.scheduleAt called before load() succeeded');
		}
		const ctx = await this.ensureAudioContext();
		this.cancelScheduled();

		const serverNow = serverNowProvider();
		const delaySec = Math.max(0, (playAtMs - serverNow) / 1000);
		const startCtxTime = ctx.currentTime + delaySec;

		const safeOffset = Math.max(0, Math.min(offsetSec, this.audioBuffer.duration));

		const source = ctx.createBufferSource();
		source.buffer = this.audioBuffer;
		source.connect(ctx.destination);
		source.start(startCtxTime, safeOffset);
		this.activeSource = source;

		return { delayMs: Math.round(delaySec * 1000), offsetSec: safeOffset };
	}

	unload() {
		this.cancelScheduled();
		this.audioBuffer = null;
		this.lastUrl = null;
	}

	dispose() {
		this.unload();
		if (this.audioContext) {
			try {
				this.audioContext.close();
			} catch {
				// already closed
			}
			this.audioContext = null;
		}
	}
}
