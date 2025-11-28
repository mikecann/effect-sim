interface SparkleIconProps {
  color?: string;
  size?: number;
  props?: { color?: [number, number, number]; sparklesPerFrame?: number };
}

export function SparkleIcon({ color, size = 14, props }: SparkleIconProps) {
  // Extract color from props if available
  const rgb = props?.color ?? [255, 255, 255];
  const [r, g, b] = rgb;
  const rgbString = `rgb(${r}, ${g}, ${b})`;
  const sparklesPerFrame = props?.sparklesPerFrame ?? 1;

  // Calculate brightness to determine text color
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const textColor = brightness > 128 ? "black" : "white";

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: rgbString,
        border: `1px solid ${color ?? "rgba(255, 255, 255, 0.3)"}`,
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
          fontSize: Math.max(8, size * 0.5),
          fontWeight: 600,
          color: textColor,
          lineHeight: 1,
          textShadow:
            brightness > 128
              ? "0 0 2px rgba(255, 255, 255, 0.8)"
              : "0 0 2px rgba(0, 0, 0, 0.8)",
        }}
      >
        {sparklesPerFrame}
      </span>
    </div>
  );
}

