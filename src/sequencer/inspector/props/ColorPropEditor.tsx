import { ColorInput } from "@mantine/core";
import type { ColorProp } from "../../../common/props/inspectableProps";

type ColorPropEditorProps = {
  label: string;
  value: ColorProp | undefined;
  onChange: (value: ColorProp) => void;
};

export function ColorPropEditor({
  label,
  value,
  onChange,
}: ColorPropEditorProps) {
  // Convert from RGB byte tuple to hex string for the color input
  const hexValue = value
    ? `#${value
        .map((v) => Math.round(v).toString(16).padStart(2, "0"))
        .join("")}`
    : "#ffffff";

  return (
    <ColorInput
      label={label}
      value={hexValue}
      onChange={(hexColor) => {
        // Convert from hex string back to RGB tuple (byte range 0-255)
        const hex = hexColor.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        onChange([r, g, b]);
      }}
      size="sm"
      format="hex"
      swatches={[
        "#ff0000",
        "#00ff00",
        "#0000ff",
        "#ffff00",
        "#ff00ff",
        "#00ffff",
        "#ffffff",
        "#000000",
        "#808080",
        "#ff8800",
        "#ff0088",
        "#8800ff",
      ]}
      styles={{
        input: {
          backgroundColor: "var(--mantine-color-dark-5)",
          borderColor: "var(--mantine-color-dark-4)",
        },
      }}
    />
  );
}
