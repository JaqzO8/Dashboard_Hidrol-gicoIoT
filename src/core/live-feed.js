import { fetchLatest, fetchSnapshot } from "../services/thingspeak.js";

export const LIVE_INTERVAL_MS = 15000;

export class LiveFeedController {
  constructor({ getConfig, onSnapshot, onLatest, onState, onError, interval = LIVE_INTERVAL_MS }) {
    this.getConfig = getConfig;
    this.onSnapshot = onSnapshot;
    this.onLatest = onLatest;
    this.onState = onState;
    this.onError = onError;
    this.interval = interval;
    this.timer = null;
    this.abortController = null;
    this.running = false;
    this.failureCount = 0;
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
      this.onSnapshot(payload, { notify });
      this.onState?.("online", this.interval);
    } catch (error) {
      if (error.name !== "AbortError") {
        this.failureCount += 1;
        this.onError(error);
        this.onState?.("offline", this.nextDelay());
      }
    } finally {
      this.abortController = null;
      if (this.running) this.schedule();
    }
  }

  async poll() {
    if (!this.running) return;
    if (document.hidden || !navigator.onLine) {
      this.onState?.(navigator.onLine ? "paused" : "offline", this.interval);
      this.schedule();
      return;
    }
    const config = this.getConfig();
    if (!config.channel) return;
    this.abortController = new AbortController();
    try {
      const latest = await fetchLatest(config, this.abortController.signal);
      this.failureCount = 0;
      this.onLatest(latest);
      this.onState?.("online", this.interval);
    } catch (error) {
      if (error.name !== "AbortError") {
        this.failureCount += 1;
        this.onError(error, { silent: true });
        this.onState?.("offline", this.nextDelay());
      }
    } finally {
      this.abortController = null;
      if (this.running) this.schedule();
    }
  }

  nextDelay() {
    return Math.min(this.interval * 2 ** Math.min(this.failureCount, 3), 120000);
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), this.failureCount ? this.nextDelay() : this.interval);
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
