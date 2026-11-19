import { useState, type ReactNode } from "react";
import { Alert, Box, Button, Loader, Stack, Text, Title } from "@mantine/core";
import { IconBrandGoogleFilled } from "@tabler/icons-react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  useOauth,
  useSignInWithGoogle,
} from "@convex-dev/auth/methods/google/react";
import { api } from "../../../convex/_generated/api";

/**
 * Opens the editor only to an editor signed in with Google (convex/editors.ts).
 * The server is the real gate: every editor mutation checks the sign-in
 * itself. This only keeps the editor from loading for someone it would
 * refuse. Where tokens aren't required (a local backend) it opens straight
 * away.
 */
export const EditorGate = ({ children }: { children: ReactNode }) => {
  const { isLoading } = useConvexAuth();
  const me = useQuery(api.editors.me, isLoading ? "skip" : {});
  if (isLoading || me === undefined)
    return (
      <Centered>
        <Loader size="lg" />
      </Centered>
    );
  if (me.editor || !me.signInNeeded) return children;
  return <SignIn />;
};

const Centered = ({ children }: { children: ReactNode }) => (
  <Box
    style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </Box>
);

const SignIn = () => {
  const { isAuthenticated } = useConvexAuth();
  const { signIn } = useSignInWithGoogle(api.editors);
  const { signOut } = useAuthActions();
  const { flowError } = useOauth();
  // Spins, and stays off, until the page leaves for Google (or comes back if starting failed).
  const [isPending, setIsPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (isAuthenticated)
    return (
      <Centered>
        <Stack gap="md" w={340}>
          <Title order={3}>Effect Sim</Title>
          <Text size="sm">
            That Google account can't use the editor. Sign out and try another.
          </Text>
          <Button
            variant="default"
            loading={isPending}
            disabled={isPending}
            onClick={() => {
              setIsPending(true);
              void signOut().finally(() => setIsPending(false));
            }}
          >
            Sign out
          </Button>
        </Stack>
      </Centered>
    );

  const problem =
    failed || (flowError !== null && flowError.error !== "ACCESS_DENIED");
  return (
    <Centered>
      <Stack gap="md" w={340}>
        <Title order={3}>Effect Sim</Title>
        <Text size="sm">Sign in to edit the lights.</Text>
        <Button
          leftSection={<IconBrandGoogleFilled size={18} />}
          loading={isPending}
          disabled={isPending}
          onClick={() => {
            setIsPending(true);
            setFailed(false);
            const { origin, pathname, search } = window.location;
            void signIn({ redirectTo: `${origin}${pathname}${search}` }).then(
              (result) => {
                if (result.status !== "error") return;
                setIsPending(false);
                setFailed(true);
              },
            );
          }}
        >
          Continue with Google
        </Button>
        {problem ? (
          <Alert color="red" variant="light">
            That didn't work, or that Google account can't use the editor.
          </Alert>
        ) : null}
      </Stack>
    </Centered>
  );
};
