/**
 * A bot token as @BotFather gives it: the bot's numeric id, a colon, then a secret of about 35 characters. The
 * check is local and catches a paste of something else before any call to Telegram.
 */
const TOKEN_SHAPE = /^(\d{5,15}):[A-Za-z0-9_-]{30,64}$/;

/** The bot's numeric id when the token has the right shape, `null` otherwise. */
export function botIdOfToken(token: string): string | null {
  const match = TOKEN_SHAPE.exec(token.trim());
  return match?.[1] ?? null;
}
