import { useState } from "react";
import { Button, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { useMutation } from "convex/react";
import { observer } from "mobx-react-lite";
import { api } from "../../../convex/_generated/api";
import { useApp } from "../AppContext";
import { isUnauthorized } from "./EditorTokenModel";

/**
 * Asks for the editor token once (or again, if the server refuses it), checks
 * it with the server, and keeps it in this browser.
 */
export const EditorTokenModal = observer(() => {
  const app = useApp();
  const check = useMutation(api.editor.checkToken);
  const [value, setValue] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = app.editorToken.askReason;

  const save = async () => {
    const token = value.trim();
    if (!token || isChecking) return;
    setIsChecking(true);
    setError(null);
    try {
      await check({ token });
      app.editorToken.set(token);
      setValue("");
      app.sync?.flush();
    } catch (e) {
      setError(
        isUnauthorized(e)
          ? "That isn't the editor token."
          : `Couldn't check it: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Modal
      opened={reason !== null}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      title="Editor token"
      size="sm"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Stack gap="sm">
          <Text size="sm">{reason}</Text>
          <Text size="xs" c="dimmed">
            It's EDITOR_TOKEN in the Convex deployment's environment variables.
            This browser keeps it, so you'll only be asked once.
          </Text>
          <PasswordInput
            label="Token"
            value={value}
            autoFocus
            disabled={isChecking}
            error={error}
            onChange={(e) => setValue(e.currentTarget.value)}
            data-testid="editor-token-input"
          />
          <Button
            type="submit"
            loading={isChecking}
            disabled={!value.trim() || isChecking}
          >
            Save token
          </Button>
        </Stack>
      </form>
    </Modal>
  );
});
