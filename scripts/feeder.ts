import chatScript from './chat-script.json' with { type: 'json' };

/** Replays a multilingual chat script into the local mock endpoint. */
const port = Number(process.env.PORT ?? 3000);
const speed = readSpeed(process.argv);
const shouldLoop = process.argv.includes('--loop');
const endpoint = `http://localhost:${port}/mock/chat`;
const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function replayScript(): Promise<void> {
  do {
    for (const line of chatScript) {
      if (line.pauseBeforeMs !== undefined) {
        await wait(line.pauseBeforeMs);
        continue;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user: line.user, text: line.text }),
      });

      if (!response.ok) {
        throw new Error(
          `Feeder request failed: ${response.status} ${await response.text()}`,
        );
      }

      await wait(Math.max(10, line.delayMs / speed));
    }
  } while (shouldLoop);
}

function readSpeed(argumentsList: string[]): number {
  const speedIndex = argumentsList.findIndex((argument) =>
    argument.startsWith('--speed='),
  );
  const separatedSpeedIndex = argumentsList.indexOf('--speed');
  const speedValue =
    speedIndex >= 0
      ? argumentsList[speedIndex]?.split('=')[1]
      : separatedSpeedIndex >= 0
        ? argumentsList[separatedSpeedIndex + 1]
        : '1';
  const value = Number(speedValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('The --speed value must be a positive number.');
  }

  return value;
}

await replayScript();
