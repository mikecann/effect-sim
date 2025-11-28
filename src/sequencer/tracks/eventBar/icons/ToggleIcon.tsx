import { IconPower } from "@tabler/icons-react";

interface ToggleIconProps {
  color?: string;
  size?: number;
}

export function ToggleIcon({ color, size = 14 }: ToggleIconProps) {
  const iconColor = color ?? "white";

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.5px solid ${iconColor}`,
        backgroundColor: `rgba(255, 255, 255, 0.2)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        position: "relative",
      }}
    >
      <IconPower
        size={size * 0.6}
        style={{
          color: iconColor,
          strokeWidth: 2.5,
        }}
      />
      {/* Toggle indicator - small dot */}
      <div
        style={{
          position: "absolute",
          bottom: -1,
          right: -1,
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: "50%",
          backgroundColor: iconColor,
          border: `1px solid ${iconColor === "white" ? "black" : "white"}`,
        }}
      />
    </div>
  );
}
