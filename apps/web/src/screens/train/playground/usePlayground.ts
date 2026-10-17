import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { createHttpClient, PlaygroundError, type PlaygroundClient, type PlaygroundErrorCode } from './client';
import { createDemoClient } from './demo';
import type { PlaygroundState } from './model';

const http = createHttpClient();
let demo: PlaygroundClient | undefined;

export interface Playground {
  readonly client: PlaygroundClient;
  readonly state: PlaygroundState | undefined;
  readonly isLoading: boolean;
  /** A call is running: the agent writes, or the server answers. */
  readonly busy: boolean;
  readonly error: PlaygroundErrorCode | undefined;
  /** Runs one call and puts the state it returns on screen. */
  run(call: (client: PlaygroundClient) => Promise<PlaygroundState>): Promise<boolean>;
  /** Shows an error from a call that returns no state (the comparison). */
  fail(code: PlaygroundErrorCode): void;
  /** Switches to answers written in advance, when the server cannot be reached. */
  readonly switchToDemo: () => void;
}

function demoClient(): PlaygroundClient {
  demo ??= createDemoClient();
  return demo;
}

/**
 * The playground state lives on the server (one session per user). Until the routes are deployed, the screen
 * falls back to the demo client, and says so.
 */
export function usePlayground(): Playground {
  const queryClient = useQueryClient();
  const [client, setClient] = useState<PlaygroundClient>(http);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlaygroundErrorCode | undefined>(undefined);

  const query = useQuery({
    queryKey: ['playground', client.isDemo],
    queryFn: async () => {
      try {
        return await client.state();
      } catch (cause) {
        if (cause instanceof PlaygroundError && cause.code === 'not_deployed' && !client.isDemo) {
          setClient(demoClient());
        } else {
          setError(cause instanceof PlaygroundError ? cause.code : 'failed');
        }
        throw cause;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const run = useCallback(
    async (call: (c: PlaygroundClient) => Promise<PlaygroundState>): Promise<boolean> => {
      setBusy(true);
      setError(undefined);
      try {
        queryClient.setQueryData(['playground', client.isDemo], await call(client));
        return true;
      } catch (cause) {
        setError(cause instanceof PlaygroundError ? cause.code : 'failed');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [client, queryClient],
  );

  return {
    client,
    state: query.data,
    isLoading: query.isPending,
    busy,
    error,
    run,
    fail: setError,
    switchToDemo: () => {
      setError(undefined);
      setClient(demoClient());
    },
  };
}
