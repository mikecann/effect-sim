interface SetColorIconProps {
  color?: string;
  size?: number;
  props?: { color?: [number, number, number] };
}

export function SetColorIcon({ color, size = 14, props }: SetColorIconProps) {
  // Extract color from props if available
  const rgb = props?.color ?? [255, 255, 255];
  const [r, g, b] = rgb;
  const rgbString = `rgb(${r}, ${g}, ${b})`;

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: rgbString,
        border: `1px solid ${color ?? "rgba(255, 255, 255, 0.3)"}`,
        borderRadius: 2,
        flexShrink: 0,
      }}
    />
  );
}

