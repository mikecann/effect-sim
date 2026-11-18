import { useEffect, useRef } from "react";
import { useApp } from "../../common/AppContext";
import { observer } from "mobx-react-observer";

export const StringSegmentRangeInstantIndicator = observer(() => {
  const appModel = useApp();

  const selectedEntity = appModel.selectedEntity;
  const isVirtualString = selectedEntity?.kind === "virtual_string";
  const virtualStringNode = isVirtualString ? selectedEntity.node : null;
  const selectedSegmentIndex = isVirtualString
    ? selectedEntity.selectedSegmentIndex
    : null;

  const segment =
    virtualStringNode && selectedSegmentIndex !== null
      ? virtualStringNode.segments[selectedSegmentIndex]
      : null;

  const stringNode =
    segment && appModel.project
      ? appModel.project.nodes.find((n) => n._id === segment.nodeId)
      : null;

  const ipAddress =
    stringNode?.kind === "string" ? stringNode.ipAddress : undefined;

  const ledCount =
    stringNode?.kind === "string" ? stringNode.ledCount : undefined;

  const start = segment?.fromIndex;
  const end = segment?.toIndex;

  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef({ ledCount, start, end });

  // Update state ref whenever these change so the socket callbacks can access the latest values
  useEffect(() => {
    stateRef.current = { ledCount, start, end };
  }, [ledCount, start, end]);

  // Manage WebSocket connection
  useEffect(() => {
    console.log("ipAddress", ipAddress);

    if (!ipAddress) return;

    console.log("Connecting to WebSocket", ipAddress);

    const ws = new WebSocket(`ws://${ipAddress}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      const { ledCount, start, end } = stateRef.current;
      if (ledCount === undefined || start === undefined || end === undefined)
        return;

      console.log(
        "WS Connected, setting segment indicator color",
        ipAddress,
        ledCount,
        start,
        end,
      );

      ws.send(
        JSON.stringify({
          seg: {
            i: [0, ledCount, [0, 0, 0], start, end, [255, 255, 0]],
          },
        }),
      );
    };

    ws.onerror = (e) => {
      console.error("WebSocket error", e);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        // Reset to white before closing
        const { ledCount } = stateRef.current;
        if (ledCount !== undefined)
          ws.send(
            JSON.stringify({
              seg: {
                i: [0, ledCount, [255, 255, 255]],
              },
            }),
          );

        ws.close();
      } else ws.close();
    };
  }, [ipAddress]);

  // Send updates when range changes
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (ledCount === undefined || start === undefined || end === undefined)
      return;
    console.log("ws update...", ws?.readyState);

    console.log(
      "Setting segment indicator color",
      ipAddress,
      ledCount,
      start,
      end,
    );

    ws.send(
      JSON.stringify({
        seg: {
          i: [0, ledCount, [0, 0, 0], start, end, [255, 255, 0]],
        },
      }),
    );
  }, [ledCount, start, end]);

  return null;
});
