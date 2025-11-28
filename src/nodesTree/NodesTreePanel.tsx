import { Stack, Text, Group } from "@mantine/core";
import { useEffect, useRef } from "react";
import { NodesTree } from "./NodesTree";
import { NodesTreeDeleteAction } from "./NodesTreeDeleteAction";
import { NodesTreeAddMenu } from "./NodesTreeAddMenu";
import { useDeleteSelectedNodes } from "./useDeleteSelectedNodes";
import { isKeyboardEventFromEditable } from "../common/utils/keyboard";

export default function NodesTreePanel() {
  const { deleteSelectedNodes, hasSelection } = useDeleteSelectedNodes();
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle Delete key when nodes are selected and panel is focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete key
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      // Don't handle if typing in an input/textarea
      if (isKeyboardEventFromEditable(e)) return;

      // Check if panel contains the event target or active element (is focused)
      const target = e.target as HTMLElement | null;
      const isInPanel =
        panelRef.current?.contains(target) ||
        panelRef.current?.contains(document.activeElement);

      if (!isInPanel) return;

      // Only delete if there are selected nodes
      if (!hasSelection) return;

      e.preventDefault();
      e.stopPropagation();
      deleteSelectedNodes();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasSelection, deleteSelectedNodes]);

  return (
    <>
      <Stack ref={panelRef} gap="0" style={{ height: "100%" }} tabIndex={-1}>
        <Group
          bg="var(--mantine-color-dark-6)"
          p={4}
          gap={"xs"}
          justify="flex-end"
        >
          <NodesTreeDeleteAction />
          <NodesTreeAddMenu />
        </Group>
        <Stack gap="xs" p="0" pt={0}>
          <NodesTree />
        </Stack>
      </Stack>
    </>
  );
}
