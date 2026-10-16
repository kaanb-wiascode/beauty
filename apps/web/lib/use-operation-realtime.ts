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
    let reconnectAttempts = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    // Preserve events from distinct aggregates while coalescing bursts.
    // A single last-event debounce can silently skip session/sale refreshes
    // when unrelated visit or appointment events arrive within 180 ms.
    const pendingEvents = new Map<string, OperationDomainEvent>();
    const dispatch = (event: OperationDomainEvent) => {
      if (event.eventName === "operations.heartbeat") return;
      // Distinct transitions of the same aggregate must not overwrite one another.
      // An event ID also avoids merging separate changes with the same event name.
      const key = event.id
        ? event.id
        : `${event.eventName}:${event.aggregateType ?? ""}:${event.aggregateId ?? ""}`;
      pendingEvents.set(key, event);
      // Start one bounded flush window; constant traffic must not postpone updates.
      if (!refreshTimer) {
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          if (!active) return;
          const events = [...pendingEvents.values()];
          pendingEvents.clear();
          for (const pending of events) callbackRef.current(pending);
        }, 180);
      }
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

        reconnectAttempts = 0;
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
        // Back off during outages to avoid hammering a struggling API.
        const delay = Math.min(3000 * 2 ** reconnectAttempts, 30000);
        reconnectAttempts = Math.min(reconnectAttempts + 1, 4);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void connect();
        }, delay);
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
