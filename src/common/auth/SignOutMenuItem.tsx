import { useState } from "react";
import { Loader, Menu } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { notifications } from "@mantine/notifications";
import { api } from "../../../convex/_generated/api";
import { useApp } from "../AppContext";

/** "Sign out (email)" in the File menu, when signed in with Google. */
export const SignOutMenuItem = () => {
  const app = useApp();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.editors.me, isAuthenticated ? {} : "skip");
  const { signOut } = useAuthActions();
  const [isPending, setIsPending] = useState(false);
  if (!isAuthenticated) return null;
  return (
    <Menu.Item
      closeMenuOnClick={false}
      disabled={isPending}
      leftSection={isPending ? <Loader size={14} /> : <IconLogout size={16} />}
      onClick={() => {
        setIsPending(true);
        // Edits still waiting to save go first: once signed out the server
        // would refuse them. Signed out, the editor swaps to the sign-in.
        void (async () => {
          if (app.sync && !(await app.sync.saveNow())) {
            notifications.show({
              color: "red",
              title: "Still signed in",
              message:
                "Your last changes haven't saved yet. Try again once they have.",
            });
            setIsPending(false);
            return;
          }
          await signOut().catch(() => setIsPending(false));
        })();
      }}
    >
      Sign out{me?.editor ? ` (${me.editor.email})` : ""}
    </Menu.Item>
  );
};
