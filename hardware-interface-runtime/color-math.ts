type Led = [number, number, number];

/**
 * Utility class for color-related mathematical calculations
 */
export class ColorMath {
  /**
   * Converts HSV color values to RGB
   * @param h - Hue value (0-360)
   * @param s - Saturation value (0-1)
   * @param v - Value/Brightness (0-1)
   * @returns RGB values as a readonly tuple [r, g, b] with values from 0-255
   */
  public static hsvToRgb(h: number, s: number, v: number): Led {
    // Ensure h is within 0-360 range
    h = h % 360;

    // Calculate chroma, secondary component, and match value
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0,
      g = 0,
      b = 0;

    if (h >= 0 && h < 60) [r, g, b] = [c, x, 0];
    else if (h >= 60 && h < 120) [r, g, b] = [x, c, 0];
    else if (h >= 120 && h < 180) [r, g, b] = [0, c, x];
    else if (h >= 180 && h < 240) [r, g, b] = [0, x, c];
    else if (h >= 240 && h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    // Convert to 0-255 range and return as LED tuple
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  /**
   * Generates an array of LEDs with rainbow colors
   * @param count - Number of LEDs to generate
   * @param offset - Value to offset the Hue by, default 0
   * @param saturation - Color saturation (0-1), default 1
   * @param value - Color brightness (0-1), default 1
   * @returns Array of LED objects with RGB values
   */
  public static generateRainbow(
    count: number,
    shift: number = 0,
    saturation: number = 1,
    value: number = 1,
  ): readonly Led[] {
    const rainbow: Led[] = [];

    // Calculate the hue step to distribute colors evenly across the spectrum
    const hueStep = 360 / count;

    // Generate each LED color
    for (let i = 0; i < count; i++) {
      // Calculate the hue for this position (0-360)
      const hue = (i * hueStep + shift) % 360;

      // Convert HSV to RGB and add to the rainbow array
      rainbow.push(this.hsvToRgb(hue, saturation, value));
    }

    return rainbow;
  }
}
