import { useEffect } from "react";
import { useApp } from "../../common/AppContext";
import { observer } from "mobx-react-lite";

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

  useEffect(() => {
    if (
      !ipAddress ||
      ledCount === undefined ||
      start === undefined ||
      end === undefined
    )
      return;

    console.log(
      "Setting segment indicator color",
      ipAddress,
      ledCount,
      start,
      end,
    );

    // Set LEDs: range yellow, others black
    fetch(`http://${ipAddress}/json/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seg: {
          i: [0, ledCount, [0, 0, 0], start, end, [255, 255, 0]],
        },
      }),
    }).catch((e) => console.error("Failed to set segment indicator color", e));

    return () => {
      // Cleanup: Set all to white
      fetch(`http://${ipAddress}/json/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seg: {
            i: [0, ledCount, [255, 255, 255]],
          },
        }),
      }).catch((e) => console.error("Failed to reset colors", e));
    };
  }, [ipAddress, ledCount, start, end]);

  return null;
});
