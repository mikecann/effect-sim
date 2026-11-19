import { useState } from "react";
import { Loader, Menu } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";

/** "Sign out (email)" in the File menu, when signed in with Google. */
export const SignOutMenuItem = () => {
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
        // Signed out, the editor swaps to the sign-in; if it fails, the item comes back.
        void signOut().catch(() => setIsPending(false));
      }}
    >
      Sign out{me?.editor ? ` (${me.editor.email})` : ""}
    </Menu.Item>
  );
};
