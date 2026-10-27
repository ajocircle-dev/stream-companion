/** Parses streamer translation commands without accepting empty language or text. */
export function parseReplyCommand(
  text: string,
): { language: string; text: string } | null {
  const match = text.match(/^!reply\s+([a-z]{2,5})\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    language: match[1]!.toLocaleLowerCase(),
    text: match[2]!.trim(),
  };
}
