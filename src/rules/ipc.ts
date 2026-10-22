import type { Rule } from "./types.js";

export const ipcSenderValidationRule: Rule = {
  id: "ipc-sender-validation",
  description: "Main-process IPC handlers that never check which page sent the message.",
  check(report) {
    const { mainHandlers, senderValidations } = report.ipc;
    if (mainHandlers === 0 || senderValidations > 0) return [];
    return [
      {
        ruleId: this.id,
        severity: "low",
        title: "IPC handlers do not check the sender",
        detail: `${mainHandlers} main-process handler${mainHandlers === 1 ? "" : "s"}, and no check of event.senderFrame or event.sender was found. Any page that can send IPC, including an injected one, is trusted.`,
        locations: [],
      },
    ];
  },
};

export const dynamicIpcChannelsRule: Rule = {
  id: "dynamic-ipc-channels",
  description: "IPC calls whose channel name is computed at runtime.",
  check(report) {
    const count = report.ipc.dynamicChannelOperations;
    if (count === 0) return [];
    return [
      {
        ruleId: this.id,
        // Info, not low: 18 of 20 corpus apps match, so on its own it does not single anything out.
        // Kept as a pointer for reviewers rather than a warning.
        severity: "info",
        title: "IPC channel names chosen at runtime",
        detail: `${count} IPC call${count === 1 ? "" : "s"} take the channel name from a variable. When a preload script forwards a channel chosen by the page, the page can reach every handler; worth reviewing.`,
        locations: [],
      },
    ];
  },
};
