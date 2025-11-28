interface MultiplyAllIconProps {
  color?: string;
  size?: number;
  props?: { multiplier?: number };
}

export function MultiplyAllIcon({
  color,
  size = 14,
  props,
}: MultiplyAllIconProps) {
  const multiplier = props?.multiplier ?? 0.9;
  const opacity = Math.max(0, Math.min(1, multiplier));
  const textColor = color ?? "white";

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: `rgba(255, 255, 255, ${opacity})`,
        border: `1px solid ${textColor === "white" ? "rgba(255, 255, 255, 0.3)" : textColor}`,
        borderRadius: 2,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <span
        style={{
          fontSize: Math.max(7, size * 0.45),
          fontWeight: 600,
          color: textColor,
          lineHeight: 1,
          textShadow: "0 0 2px rgba(0, 0, 0, 0.8)",
        }}
      >
        {multiplier.toFixed(1)}
      </span>
    </div>
  );
}
