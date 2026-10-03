"use client";

import { useEffect, useRef } from "react";

import { apiResponse } from "./api";

export type OperationDomainEvent = {
  id?: string;
  eventName: string;
  aggregateType?: string;
  aggregateId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
};

export function useOperationRealtime(
  onEvent: (event: OperationDomainEvent) => void,
  enabled = true,
) {
  const callbackRef = useRef(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const dispatch = (event: OperationDomainEvent) => {
      if (event.eventName === "operations.heartbeat") return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        callbackRef.current(event);
      }, 180);
    };

    const parseBlock = (block: string) => {
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) return;

      try {
        const parsed = JSON.parse(data) as OperationDomainEvent;
        if (parsed?.eventName) dispatch(parsed);
      } catch {
        // Ignore incomplete or non-JSON SSE payloads.
      }
    };

    const connect = async () => {
      try {
        const response = await apiResponse("/operations/events/stream", {
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error("Canlı operasyon bağlantısı kurulamadı.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

          let separator = buffer.indexOf("\n\n");
          while (separator >= 0) {
            const block = buffer.slice(0, separator);
            buffer = buffer.slice(separator + 2);
            parseBlock(block);
            separator = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
      }

      if (active) {
        retryTimer = setTimeout(() => {
          void connect();
        }, 3000);
      }
    };

    void connect();

    return () => {
      active = false;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [enabled]);
}
