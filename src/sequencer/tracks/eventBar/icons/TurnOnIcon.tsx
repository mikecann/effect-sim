import { IconPower } from "@tabler/icons-react";

interface TurnOnIconProps {
  color?: string;
  size?: number;
}

export function TurnOnIcon({ color, size = 14 }: TurnOnIconProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color ?? "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <IconPower
        size={size * 0.6}
        style={{
          color: color === "white" ? "black" : "white",
          strokeWidth: 2.5,
        }}
      />
    </div>
  );
}
