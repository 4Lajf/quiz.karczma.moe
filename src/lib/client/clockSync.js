// src/lib/client/clockSync.js
// Cristian-style multi-sample clock sync against /api/time.
// Returns the offset (ms) to add to Date.now() to estimate server time.
// We pick the sample with the smallest round-trip time to minimise asymmetric-route bias.

const DEFAULT_SAMPLES = 5;
const DEFAULT_TIMEOUT_MS = 1500;

async function takeSingleSample({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
	const controller = new AbortController();
	const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
	const t0 = Date.now();
	try {
		const response = await fetch('/api/time', { cache: 'no-store', signal: controller.signal });
		const t1 = Date.now();
		if (!response.ok) return null;
		const result = await response.json();
		if (typeof result?.serverNow !== 'number') return null;
		const rtt = t1 - t0;
		const localMidpoint = t0 + rtt / 2;
		return {
			rtt,
			offset: Math.round(result.serverNow - localMidpoint)
		};
	} catch {
		return null;
	} finally {
		clearTimeout(abortTimer);
	}
}

export async function syncClock({ samples = DEFAULT_SAMPLES, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
	const collected = [];
	for (let i = 0; i < samples; i += 1) {
		const sample = await takeSingleSample({ timeoutMs });
		if (sample) collected.push(sample);
	}

	if (collected.length === 0) {
		return { offsetMs: 0, rttMs: null, samples: 0 };
	}

	collected.sort((a, b) => a.rtt - b.rtt);
	const best = collected[0];
	return {
		offsetMs: best.offset,
		rttMs: best.rtt,
		samples: collected.length
	};
}

export function createClockSync() {
	let offsetMs = 0;
	let lastRttMs = null;
	let lastSyncedAt = null;

	return {
		get offsetMs() {
			return offsetMs;
		},
		get lastRttMs() {
			return lastRttMs;
		},
		get lastSyncedAt() {
			return lastSyncedAt;
		},
		serverNow() {
			return Date.now() + offsetMs;
		},
		async resync(options) {
			const result = await syncClock(options);
			if (result.samples > 0) {
				offsetMs = result.offsetMs;
				lastRttMs = result.rttMs;
				lastSyncedAt = Date.now();
			}
			return result;
		}
	};
}
