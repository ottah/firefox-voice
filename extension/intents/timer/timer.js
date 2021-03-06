/* globals catcher, chrono */

import * as intentRunner from "../../background/intentRunner.js";

class TimerController {
  constructor() {
    this.activeTimer = null;
  }

  getActiveTimer() {
    return this.activeTimer;
  }

  closeActiveTimer() {
    this.activeTimer.close();
    this.activeTimer = null;
  }

  setActiveTimer(totalInMS) {
    this.activeTimer = new Timer(totalInMS);
    this.activeTimer.start();
  }
}

class Timer {
  constructor(totalInMS) {
    this.totalInMS = totalInMS;
    this.startTimestamp = undefined;
    this.remainingInMS = undefined;
    this.paused = undefined;
  }

  close() {
    this.startTimestamp = undefined;
    this.totalInMS = undefined;
    this.remainingInMS = undefined;
    if (this.timeoutId !== undefined) clearTimeout(this.timeoutId);
  }

  pause() {
    this.paused = true;
    this.remainingInMS = this.remainingMs();
    if (this.timeoutId !== undefined) clearTimeout(this.timeoutId);
  }

  async unpause() {
    this.paused = false;
    return this.start(this.remainingInMS);
  }

  remainingMs() {
    return this.totalInMS - (new Date().getTime() - this.startTimestamp);
  }

  reset() {
    if (this.timeoutId !== undefined) clearTimeout(this.timeoutId);

    return this.start(this.totalInMS);
  }

  async start(duration = this.totalInMS) {
    this.startTimestamp = new Date().getTime();
    this.remainingInMS = duration;

    this.timeoutId = setTimeout(() => this.openPopup(), duration);
  }

  async openPopup() {
    // send message to popup and open it if no response;
    // do not close timeout now; make popup do it
    try {
      const result = await browser.runtime.sendMessage({
        type: "closeTimer",
        totalInMS: this.totalInMS, // piggyback
      });
      if (result) {
        return null;
      }
    } catch (e) {
      catcher.capture(e);
    }

    return browser.experiments.voice.openPopup();
  }
}

export const timerController = new TimerController();

intentRunner.registerIntent({
  name: "timer.set",
  async run(context) {
    const activeTimer = timerController.getActiveTimer();
    if (activeTimer !== null) {
      const e = new Error("Failed to set timer");
      e.displayMessage = "Only one timer can be active.";
      throw e;
    }

    context.keepPopup();
    const result = chrono.parse(context.slots.time);

    if (result === null || result.length === 0) {
      const e = new Error("Failed to set timer");
      e.displayMessage = `Cannot set timer for ${context.slots.time}`;
      throw e;
    }

    let ms = 0;
    for (let i = 0; i < result.length; i++) {
      const startTime = result[i].ref;
      const endTime = result[i].start.date();
      // skip if timer is set for 0 seconds
      const time = parseInt(result[i].text);
      if (time === 0) {
        continue;
      }
      // round up to actual number of seconds
      ms += Math.ceil((endTime - startTime) / 1000.0) * 1000;
    }

    if (ms === 0) {
      const e = new Error("Failed to set timer");
      e.displayMessage = "Cannot set timer for 0 seconds";
      throw e;
    }
    timerController.setActiveTimer(ms);

    await browser.runtime.sendMessage({
      type: "setTimer",
      timerInMS: ms,
    });
  },
});

intentRunner.registerIntent({
  name: "timer.close",
  async run() {
    const activeTimer = timerController.getActiveTimer();
    if (activeTimer === null) {
      const e = new Error("Failed to close timer");
      e.displayMessage = "No timer is set.";
      throw e;
    }
    timerController.closeActiveTimer();
  },
});

intentRunner.registerIntent({
  name: "timer.reset",
  async run() {
    const activeTimer = timerController.getActiveTimer();
    if (activeTimer === null) {
      const e = new Error("Failed to reset timer");
      e.displayMessage = "No timer is set.";
      throw e;
    }
    activeTimer.reset();
  },
});

intentRunner.registerIntent({
  name: "timer.pause",
  async run() {
    const activeTimer = timerController.getActiveTimer();
    if (activeTimer === null) {
      const e = new Error("Failed to pause timer");
      e.displayMessage = "No timer is set.";
      throw e;
    }
    activeTimer.pause();
  },
});

intentRunner.registerIntent({
  name: "timer.unpause",
  async run() {
    const activeTimer = timerController.getActiveTimer();
    if (activeTimer === null || activeTimer.paused === false) {
      const e = new Error("Failed to unpause timer");
      e.displayMessage = "No active timer.";
      throw e;
    }
    activeTimer.unpause();
  },
});
