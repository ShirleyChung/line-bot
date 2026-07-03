import { replyText } from "../platform/reply.js";
import {
  buildWorldCupBroadcastText,
  disableWorldCupBroadcast,
  enableWorldCupBroadcast,
  getBroadcastPlatform,
  isWorldCupBroadcastStartCommand,
  isWorldCupBroadcastStopCommand,
} from "../services/worldCupBroadcastService.js";

export {
  isWorldCupBroadcastStartCommand,
  isWorldCupBroadcastStopCommand,
};

export async function handleWorldCupBroadcastMessage(event, text, context = {}) {
  if (isWorldCupBroadcastStopCommand(text)) {
    const result = await disableWorldCupBroadcast(context.sessionKey);
    return replyText(
      event,
      result.stopped ? "已停止世足文字轉播。" : "目前沒有啟動中的世足文字轉播。"
    );
  }

  if (!isWorldCupBroadcastStartCommand(text)) {
    return false;
  }

  const subscription = await enableWorldCupBroadcast(context.sessionKey, event.source);
  const { text: broadcastText } = await buildWorldCupBroadcastText();
  const platform = getBroadcastPlatform(event.source);
  const suffix = platform === "telegram" && subscription.mode === "push"
    ? "\n\n已啟動 Telegram 主動文字轉播；有新戰況時會推送。輸入「停止轉播」可取消。"
    : "\n\nLINE 平台目前只提供詢問式回覆，不會主動推播；之後再輸入「我要看目前世足戰況」即可更新。";

  await replyText(event, `${broadcastText}${suffix}`);
  return true;
}
