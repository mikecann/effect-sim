import { IconPower } from "@tabler/icons-react";

interface TurnOffIconProps {
  color?: string;
  size?: number;
}

export function TurnOffIcon({ color, size = 14 }: TurnOffIconProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${color ?? "white"}`,
        backgroundColor: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <IconPower
        size={size * 0.6}
        style={{
          color: color ?? "white",
          strokeWidth: 2.5,
        }}
      />
    </div>
  );
}
