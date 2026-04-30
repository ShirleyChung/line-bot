import { createReminder } from "../services/reminderService.js";
import { buildSessionKey } from "../services/conversationStateService.js";

export async function executeTool(name, args, context) {
  if (name === "create_reminder") {
    // 建立提醒
    if (!args.time || isNaN(Date.parse(args.time))) {
      throw new Error("時間格式錯誤");
    }

    await createReminder({
      owner: buildSessionKey(context.source),
      target: args.target,
      action: args.action,
      time: args.time,
    });

    return {
      success: true,
      message: `已建立提醒：${args.target} 於 ${args.time} 要 ${args.action}`,
    };
  }

  throw new Error(`未知的工具: ${name}`);
}