import { Box, Text } from "@mantine/core";

export function LoadingState() {
  return (
    <Box
      style={{
        height: "100%",
        backgroundColor: "var(--mantine-color-dark-7)",
        borderLeft: "1px solid var(--mantine-color-dark-4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text c="dimmed" size="sm" ta="center">
        Loading...
      </Text>
    </Box>
  );
}

