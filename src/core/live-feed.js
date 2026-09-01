import { fetchLatest, fetchSnapshot } from "../services/thingspeak.js";

export const LIVE_INTERVAL_MS = 15000;
export const BURST_INTERVAL_MS = 5000;
export const BACKGROUND_INTERVAL_MS = 60000;
export const BURST_DURATION_MS = 20000;

export class LiveFeedController {
  constructor({ getConfig, onSnapshot, onLatest, onState, onError, interval = LIVE_INTERVAL_MS }) {
    this.getConfig = getConfig;
    this.onSnapshot = onSnapshot;
    this.onLatest = onLatest;
    this.onState = onState;
    this.onError = onError;
    this.baseInterval = interval;
    this.timer = null;
    this.abortController = null;
    this.running = false;
    this.failureCount = 0;
    this.burstUntil = 0;
    this.lastFetchSuccessTime = 0;
  }

  triggerBurst() {
    this.burstUntil = Date.now() + BURST_DURATION_MS;
  }

  currentInterval() {
    if (this.failureCount > 0) {
      return this.nextDelay();
    }
    if (typeof document !== "undefined" && document.hidden) {
      return BACKGROUND_INTERVAL_MS;
    }
    if (Date.now() < this.burstUntil) {
      return BURST_INTERVAL_MS;
    }
    return this.baseInterval;
  }

  async refresh({ notify = false } = {}) {
    this.stopRequest();
    const config = this.getConfig();
    if (!config.channel) return;
    this.running = true;
    this.onState?.("loading");
    this.abortController = new AbortController();
    try {
      const payload = await fetchSnapshot(config, this.abortController.signal);
      this.failureCount = 0;
      this.lastFetchSuccessTime = Date.now();
      this.onSnapshot(payload, { notify });
      this.onState?.("online", this.currentInterval(), { lastSuccess: this.lastFetchSuccessTime });
    } catch (error) {
      if (error.name !== "AbortError") {
        this.failureCount += 1;
        this.onError(error);
        this.onState?.("offline", this.nextDelay(), { lastSuccess: this.lastFetchSuccessTime });
      }
    } finally {
      this.abortController = null;
      if (this.running) this.schedule();
    }
  }

  async poll() {
    if (!this.running) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.onState?.("offline", this.currentInterval(), { lastSuccess: this.lastFetchSuccessTime });
      this.schedule();
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      this.onState?.("paused", BACKGROUND_INTERVAL_MS, { lastSuccess: this.lastFetchSuccessTime });
      this.schedule();
      return;
    }
    const config = this.getConfig();
    if (!config.channel) return;
    this.abortController = new AbortController();
    try {
      const latest = await fetchLatest(config, this.abortController.signal);
      this.failureCount = 0;
      this.lastFetchSuccessTime = Date.now();
      const hasNew = this.onLatest(latest);
      if (hasNew) {
        this.triggerBurst();
      }
      const isBursting = Date.now() < this.burstUntil;
      const mode = isBursting ? "burst" : "online";
      this.onState?.(mode, this.currentInterval(), { lastSuccess: this.lastFetchSuccessTime });
    } catch (error) {
      if (error.name !== "AbortError") {
        this.failureCount += 1;
        this.onError(error, { silent: true });
        this.onState?.("offline", this.nextDelay(), { lastSuccess: this.lastFetchSuccessTime });
      }
    } finally {
      this.abortController = null;
      if (this.running) this.schedule();
    }
  }

  nextDelay() {
    return Math.min(this.baseInterval * (2 ** Math.min(this.failureCount - 1, 2)), 60000);
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), this.currentInterval());
  }

  stopRequest() {
    clearTimeout(this.timer);
    this.abortController?.abort();
  }

  stop() {
    this.running = false;
    this.stopRequest();
  }
}

